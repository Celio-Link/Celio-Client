import { test, expect } from "vitest";
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import { LinkdeviceExchangeSession } from '../src/pages/onlineLink/linkdeviceExchangeSession';
import { LinkDeviceServiceMock, DataArray } from "./mocks/service/linkdevice.service.mock";
import { CelioDeviceMock } from './mocks/celioDeviceMock';
import {combineLatest} from 'rxjs';

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
  let linkDeviceExchangeServiceA = new LinkdeviceExchangeSession(websocketServiceA, linkDeviceServiceMockA as any)

  websocketServiceA.connect();
  let sessionInfo = await playerSessionServiceA.createSession()
  expect(sessionInfo.full).toEqual(false);

  const websocketServiceB = new WebSocketService();
  const playerSessionServiceB = new PlayerSessionService(websocketServiceB);
  const linkDeviceServiceMockB = new LinkDeviceServiceMock(celioDeviceB, celioDeviceA);
  let linkDeviceExchangeServiceB = new LinkdeviceExchangeSession(websocketServiceB, linkDeviceServiceMockB as any)

  combineLatest(playerSessionServiceA.sessionRenew$, playerSessionServiceB.sessionRenew$).subscribe(() => {
    linkDeviceExchangeServiceA = new LinkdeviceExchangeSession(websocketServiceA, linkDeviceServiceMockA as any)
    linkDeviceExchangeServiceB = new LinkdeviceExchangeSession(websocketServiceB, linkDeviceServiceMockB as any)
    celioDeviceB.restart();
    celioDeviceA.restart();
  })

  websocketServiceB.connect();
  sessionInfo = await playerSessionServiceB.joinSession(sessionInfo.id)
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


