import { test, expect } from "vitest";
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import { LinkExchangeSession } from '../src/shared/linkExchange/linkExchangeSession';
import { LinkDeviceServiceMock, DataArray } from "./mocks/service/linkdevice.service.mock";
import {CelioDeviceMock} from './mocks/celioDeviceMock';
import {CommandEmitterSocketIO} from '../src/shared/linkExchange/commandEmitter/commandEmitter.socketIO';

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

  const celioDeviceA = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchangesA++;
    if (numberOfExchangesA == successfulExchanges && numberOfExchangesB == successfulExchanges) {
      done();
    }
  },200, 50)

  const celioDeviceB = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchangesB++;
    if (numberOfExchangesA == successfulExchanges && numberOfExchangesB == successfulExchanges) {
      done();
    }
  }, 200, 50)

  const websocketServiceA = new DisconnectableWebSocketService();
  const playerSessionServiceA = new PlayerSessionService(websocketServiceA);
  const linkDeviceServiceMockA = new LinkDeviceServiceMock(celioDeviceA, celioDeviceB);
  const linkDeviceExchangeServiceA = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceA), linkDeviceServiceMockA as any);
  websocketServiceA.connect();
  let sessionInfo = await playerSessionServiceA.createSession()
  expect(sessionInfo.full).toEqual(false);

  const websocketServiceB = new WebSocketService();
  const playerSessionServiceB = new PlayerSessionService(websocketServiceB);
  const linkDeviceServiceMockB = new LinkDeviceServiceMock(celioDeviceB, celioDeviceA);
  const linkDeviceExchangeServiceB = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceB), linkDeviceServiceMockB as any);
  websocketServiceB.connect();
  sessionInfo = await playerSessionServiceB.joinSession(sessionInfo.id)
  expect(sessionInfo.full).toEqual(true);

  await linkDeviceServiceMockA.connectDevice()
  await linkDeviceServiceMockB.connectDevice()

  setTimeout(() => websocketServiceA.disconnect(), 2000)
}));
