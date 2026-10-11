import { test, expect } from "vitest";
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import { LinkExchangeSession } from '../src/shared/linkExchange/linkExchangeSession';
import { LinkDeviceServiceMock, DataArray } from "./mocks/service/linkdevice.service.mock";
import { CelioDeviceMock } from './mocks/celioDeviceMock';
import {take, zip} from 'rxjs';
import {CommandEmitterSocketIO} from '../src/shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {StatusEmitterLinkDevice} from '../src/shared/linkExchange/statusEmitter/statusEmitter.linkDevice';

test("Exchange Data in two sessions", {timeout: 20000}, () => new Promise<void>(async done => {

  const celioDeviceA = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
  }, 5)
  const celioDeviceB = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
  }, 5)


  const websocketServiceA = new WebSocketService();
  const playerSessionServiceA = new PlayerSessionService(websocketServiceA);
  const linkDeviceServiceMockA = new LinkDeviceServiceMock(celioDeviceA, celioDeviceB);
  let linkDeviceExchangeServiceA = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceA), new StatusEmitterLinkDevice(linkDeviceServiceMockA as any))

  await websocketServiceA.connect();
  let sessionInfo = await playerSessionServiceA.enterSession()
  expect(sessionInfo.full).toEqual(false);

  const websocketServiceB = new WebSocketService();
  const playerSessionServiceB = new PlayerSessionService(websocketServiceB);
  const linkDeviceServiceMockB = new LinkDeviceServiceMock(celioDeviceB, celioDeviceA);
  let linkDeviceExchangeServiceB = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceB), new StatusEmitterLinkDevice(linkDeviceServiceMockB as any))

  // The server closes the session after the link ended. Like the session panel, tear everything
  // down, reconnect and start a second session with fresh link sessions.
  zip(playerSessionServiceA.sessionClose$, playerSessionServiceB.sessionClose$).pipe(take(1)).subscribe(async () => {
    linkDeviceExchangeServiceA.destroy();
    linkDeviceExchangeServiceB.destroy();
    websocketServiceA.disconnect();
    websocketServiceB.disconnect();

    linkDeviceExchangeServiceA = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceA), new StatusEmitterLinkDevice(linkDeviceServiceMockA as any))
    linkDeviceExchangeServiceB = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceB), new StatusEmitterLinkDevice(linkDeviceServiceMockB as any))

    await websocketServiceA.connect();
    const renewedSession = await playerSessionServiceA.enterSession();
    expect(renewedSession.full).toEqual(false);
    await websocketServiceB.connect();
    expect((await playerSessionServiceB.enterSession(renewedSession.id)).full).toEqual(true);

    celioDeviceB.restart();
    celioDeviceA.restart();
  })

  await websocketServiceB.connect();
  sessionInfo = await playerSessionServiceB.enterSession(sessionInfo.id)
  expect(sessionInfo.full).toEqual(true);

  let numberOfCloseEventsA = 0;
  let numberOfCloseEventsB = 0;
  celioDeviceA.onLinkCloseCallback = () => {
    numberOfCloseEventsA++;
    if (numberOfCloseEventsA == 2 && numberOfCloseEventsB == 2) done();
  }

  celioDeviceB.onLinkCloseCallback = () => {
    numberOfCloseEventsB++
    if (numberOfCloseEventsA == 2 && numberOfCloseEventsB == 2) done();
  }

  await linkDeviceServiceMockA.connectDevice()
  await linkDeviceServiceMockB.connectDevice()
}));


