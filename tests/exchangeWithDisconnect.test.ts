import { test, expect } from "vitest";
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import { LinkDeviceExchangeService } from '../src/services/linkdeviceExchange.service';
import { LinkDeviceServiceMock, DataArray } from "./mocks/service/linkdevice.service.mock";
import { LoopbackDataGenerator } from './mocks/LoopbackDataGenerator';

class DisconnectableWebSocketService extends WebSocketService {

  override disconnect() {
    console.warn("Disconnecting socket...");
    this.socket.io.engine.transport.close();
  }
}

test("Exchange Data with Disconnect", {timeout: 10000}, () => new Promise<void>(async done => {

  const successfulExchanges: number = 100
  let numberOfExchangesA = 0;
  let numberOfExchangesB = 0;

  const LoopBackDataGeneratorA = new LoopbackDataGenerator((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchangesA++;
    if (numberOfExchangesA == successfulExchanges && numberOfExchangesB == successfulExchanges) {
      done();
    }
  }, 50)

  const LoopBackDataGeneratorB = new LoopbackDataGenerator((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchangesB++;
    if (numberOfExchangesA == successfulExchanges && numberOfExchangesB == successfulExchanges) {
      done();
    }
  }, 50)

  const websocketServiceA = new DisconnectableWebSocketService();
  const playerSessionServiceA = new PlayerSessionService(websocketServiceA);
  const linkDeviceServiceMockA = new LinkDeviceServiceMock(LoopBackDataGeneratorA, LoopBackDataGeneratorB, 100);
  const linkDeviceExchangeServiceA = new LinkDeviceExchangeService(websocketServiceA, linkDeviceServiceMockA as any);
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

  setTimeout(() => websocketServiceA.disconnect(), 2000)
}));
