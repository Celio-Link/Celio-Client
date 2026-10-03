import { test, expect } from "vitest";
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import { LinkExchangeSession } from '../src/shared/linkExchange/linkExchangeSession';
import { LinkDeviceServiceMock, DataArray } from "./mocks/service/linkdevice.service.mock";
import {CelioDeviceMock} from './mocks/celioDeviceMock';
import {DataPacket} from '../src/shared/linkExchange/common';
import {CommandEmitterSocketIO} from '../src/shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {StatusEmitterLinkDevice} from '../src/shared/linkExchange/statusEmitter/statusEmitter.linkDevice';

class LinkDeviceExchangeMockWrongSequence extends LinkExchangeSession {

  private packetBuffer: DataPacket[] = []

  override handleDeviceDataToSocket(data: DataArray) {
    let packet: DataPacket = new DataPacket(this.transmittedPacketCounter, data as any);

    this.transmittedPacketCounter++;

    // Hold back the first packets, then send with a delay of three to shuffle the order
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
  const linkDeviceExchangeServiceA = new LinkDeviceExchangeMockWrongSequence(new CommandEmitterSocketIO(websocketServiceA), new StatusEmitterLinkDevice(linkDeviceServiceMockA as any));
  await websocketServiceA.connect();
  let sessionInfo = await playerSessionServiceA.enterSession()
  expect(sessionInfo.full).toEqual(false);

  const websocketServiceB = new WebSocketService();
  const playerSessionServiceB = new PlayerSessionService(websocketServiceB);
  const linkDeviceServiceMockB = new LinkDeviceServiceMock(LoopBackDataGeneratorB, celioDeviceA);
  const linkDeviceExchangeServiceB = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceB), new StatusEmitterLinkDevice(linkDeviceServiceMockB as any));
  await websocketServiceB.connect();
  sessionInfo = await playerSessionServiceB.enterSession(sessionInfo.id)
  expect(sessionInfo.full).toEqual(true);

  await linkDeviceServiceMockA.connectDevice()
  await linkDeviceServiceMockB.connectDevice()
}));
