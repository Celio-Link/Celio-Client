import { test, expect } from "vitest";
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import { LinkExchangeSession } from '../src/shared/linkExchange/linkExchangeSession';
import { LinkDeviceServiceMock, DataArray } from "./mocks/service/linkdevice.service.mock";
import {CelioDeviceMock} from './mocks/celioDeviceMock';
import {CommandEmitterSocketIO} from '../src/shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {StatusEmitterLinkDevice} from '../src/shared/linkExchange/statusEmitter/statusEmitter.linkDevice';

/**
 * Simulates a connection that dies without the client noticing: writes are silently dropped
 * (like engine.io does when the socket is already dead) until the transport finally closes.
 */
class SilentlyDisconnectableWebSocketService extends WebSocketService {

  silentDisconnect(silentMs: number) {
    console.warn("Silently dropping outgoing packets...");
    const transport: any = this.socket.io.engine.transport;
    transport.doWrite = () => {};
    setTimeout(() => {
      console.warn("Closing silently dead transport...");
      transport.close();
    }, silentMs);
  }
}

test("Exchange Data with silent disconnect", {timeout: 20000}, () => new Promise<void>(async done => {

  const successfulExchanges: number = 100
  let numberOfExchangesA = 0;
  let numberOfExchangesB = 0;

  const celioDeviceA = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchangesA++;
    if (numberOfExchangesA >= successfulExchanges && numberOfExchangesB >= successfulExchanges) {
      done();
    }
  },200, 50)

  const celioDeviceB = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchangesB++;
    if (numberOfExchangesA >= successfulExchanges && numberOfExchangesB >= successfulExchanges) {
      done();
    }
  }, 200, 50)

  const websocketServiceA = new SilentlyDisconnectableWebSocketService();
  const playerSessionServiceA = new PlayerSessionService(websocketServiceA);
  const linkDeviceServiceMockA = new LinkDeviceServiceMock(celioDeviceA, celioDeviceB);
  const linkDeviceExchangeServiceA = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceA), new StatusEmitterLinkDevice(linkDeviceServiceMockA as any));
  await websocketServiceA.connect();
  let sessionInfo = await playerSessionServiceA.enterSession()
  expect(sessionInfo.full).toEqual(false);

  const websocketServiceB = new WebSocketService();
  const playerSessionServiceB = new PlayerSessionService(websocketServiceB);
  const linkDeviceServiceMockB = new LinkDeviceServiceMock(celioDeviceB, celioDeviceA);
  const linkDeviceExchangeServiceB = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceB), new StatusEmitterLinkDevice(linkDeviceServiceMockB as any));
  await websocketServiceB.connect();
  sessionInfo = await playerSessionServiceB.enterSession(sessionInfo.id)
  expect(sessionInfo.full).toEqual(true);

  await linkDeviceServiceMockA.connectDevice()
  await linkDeviceServiceMockB.connectDevice()

  setTimeout(() => websocketServiceA.silentDisconnect(500), 4000)
}));
