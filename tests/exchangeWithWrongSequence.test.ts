import { test, expect } from "vitest";
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import {DataPacket, LinkDeviceExchangeService} from '../src/services/linkdeviceExchange.service';
import { LinkDeviceServiceMock, DataArray } from "./mocks/service/linkdevice.service.mock";
import { LoopbackDataGenerator } from './mocks/LoopbackDataGenerator';


class LinkDeviceExchangeMockWrongSequence extends LinkDeviceExchangeService {

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

    let packet: DataPacket = {sequence: this.transmittedPacketCounter, data: data};

    this.transmittedPacketCounter++;

    if (this.transmittedPacketCounter <= 3) {
      this.packetBuffer.push(packet);
      return
    }

    this.packetBuffer.unshift(packet);

    this.websocketService.emit('deviceData', this.packetBuffer.pop()!);

    console.log("Send data to socket " + JSON.stringify(packet))
  }

}

test("Exchange Data in wrong sequence", {timeout: 10000}, () => new Promise<void>(async done => {

  const successfulExchanges: number = 6
  let numberOfExchanges = 0;

  const LoopBackDataGeneratorA = new LoopbackDataGenerator((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    if (numberOfExchanges == successfulExchanges) {
      done();
    }
    numberOfExchanges++;
  })
  const LoopBackDataGeneratorB = new LoopbackDataGenerator((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
  })

  const websocketServiceA = new WebSocketService();
  const playerSessionServiceA = new PlayerSessionService(websocketServiceA);
  const linkDeviceServiceMockA = new LinkDeviceServiceMock(LoopBackDataGeneratorA, LoopBackDataGeneratorB, 100);
  const linkDeviceExchangeServiceA = new LinkDeviceExchangeMockWrongSequence(websocketServiceA, linkDeviceServiceMockA as any);
  websocketServiceA.connect();
  let sessionInfo = await playerSessionServiceA.createSession()
  expect(sessionInfo.full).toEqual(false);

  const websocketServiceB = new WebSocketService();
  const playerSessionServiceB = new PlayerSessionService(websocketServiceB);
  const linkDeviceServiceMockB = new LinkDeviceServiceMock(LoopBackDataGeneratorB, LoopBackDataGeneratorA, 100);
  const linkDeviceExchangeServiceB = new LinkDeviceExchangeService(websocketServiceB, linkDeviceServiceMockB as any);
  websocketServiceB.connect();
  sessionInfo = await playerSessionServiceB.joinSession(sessionInfo.id)
  expect(sessionInfo.full).toEqual(true);

  await linkDeviceServiceMockA.connectDevice()
  await linkDeviceServiceMockB.connectDevice()
}));
