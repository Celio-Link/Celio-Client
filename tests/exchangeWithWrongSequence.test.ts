import { test, expect } from "vitest";
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import { LinkExchangeSession } from '../src/shared/linkExchange/linkExchangeSession';
import { LinkDeviceServiceMock, DataArray } from "./mocks/service/linkdevice.service.mock";
import {CelioDeviceMock} from './mocks/celioDeviceMock';
import {DataPacket} from '../src/shared/linkExchange/commandEmitter/commandEmitter.abstract';
import {CommandEmitterSocketIO} from '../src/shared/linkExchange/commandEmitter/commandEmitter.socketIO';

class LinkDeviceExchangeMockWrongSequence extends LinkExchangeSession {

  private packetBuffer: DataPacket[] = []

  override handleDeviceDataToSocket(data: DataArray) {
    if (this.transmittedPacketCounter < 0) return;
    const queued = this.deviceQueue.shift();
    console.log("Device queue status: " + JSON.stringify(this.deviceQueue));
    if (queued) {
      this.linkDeviceService.sendData(queued).then(
        () => console.log("Transmit data to device: ", queued),
        () => {
          console.log("Transmit data to device: ERROR, Unshift data to queue...");
          this.deviceQueue.unshift(queued);
        }
      );
    }

    let packet: DataPacket = new DataPacket(this.transmittedPacketCounter, data);

    this.transmittedPacketCounter++;

    if (this.transmittedPacketCounter <= 3) {
      this.packetBuffer.push(packet);
      return
    }

    this.packetBuffer.unshift(packet);

    this.commandEmitter.receiveData(this.packetBuffer.pop()!);

    console.log("Send data to socket " + JSON.stringify(packet))
  }

}

test("Exchange Data in wrong sequence", {timeout: 10000}, () => new Promise<void>(async done => {

  const successfulExchanges: number = 6
  let numberOfExchanges = 0;

  const celioDeviceA = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    if (numberOfExchanges == successfulExchanges) {
      done();
    }
    numberOfExchanges++;
  }, 20, 100)
  const LoopBackDataGeneratorB = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
  }, 20, 100)

  const websocketServiceA = new WebSocketService();
  const playerSessionServiceA = new PlayerSessionService(websocketServiceA);
  const linkDeviceServiceMockA = new LinkDeviceServiceMock(celioDeviceA, LoopBackDataGeneratorB);
  const linkDeviceExchangeServiceA = new LinkDeviceExchangeMockWrongSequence(new CommandEmitterSocketIO(websocketServiceA), linkDeviceServiceMockA as any);
  websocketServiceA.connect();
  let sessionInfo = await playerSessionServiceA.createSession()
  expect(sessionInfo.full).toEqual(false);

  const websocketServiceB = new WebSocketService();
  const playerSessionServiceB = new PlayerSessionService(websocketServiceB);
  const linkDeviceServiceMockB = new LinkDeviceServiceMock(LoopBackDataGeneratorB, celioDeviceA);
  const linkDeviceExchangeServiceB = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceB), linkDeviceServiceMockB as any);
  websocketServiceB.connect();
  sessionInfo = await playerSessionServiceB.joinSession(sessionInfo.id)
  expect(sessionInfo.full).toEqual(true);

  await linkDeviceServiceMockA.connectDevice()
  await linkDeviceServiceMockB.connectDevice()
}));
