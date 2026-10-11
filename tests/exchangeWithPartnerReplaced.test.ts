import { test, expect } from "vitest";
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import { LinkExchangeSession } from '../src/shared/linkExchange/linkExchangeSession';
import { LinkDeviceServiceMock, DataArray } from "./mocks/service/linkdevice.service.mock";
import { CelioDeviceMock } from './mocks/celioDeviceMock';
import {CommandEmitterSocketIO} from '../src/shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {StatusEmitterLinkDevice} from '../src/shared/linkExchange/statusEmitter/statusEmitter.linkDevice';
import {filter, firstValueFrom} from 'rxjs';

// A partner leaves before the link started and a different player takes the free spot.
// The state of the player who left must not block the handshake of the new pair.
test("Exchange Data after partner was replaced", {timeout: 10000}, () => new Promise<void>(async done => {

  const successfulExchanges: number = 6
  let numberOfExchanges = 0;
  const celioDeviceA = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchanges++;
    if (numberOfExchanges == successfulExchanges) done();
  }, 10)
  const celioDeviceC = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchanges++;
    if (numberOfExchanges == successfulExchanges) done();
  }, 10)

  const websocketServiceA = new WebSocketService();
  const playerSessionServiceA = new PlayerSessionService(websocketServiceA);
  const linkDeviceServiceMockA = new LinkDeviceServiceMock(celioDeviceA, celioDeviceC);
  const linkDeviceExchangeServiceA = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceA), new StatusEmitterLinkDevice(linkDeviceServiceMockA as any));
  await websocketServiceA.connect();
  let sessionInfo = await playerSessionServiceA.enterSession()
  expect(sessionInfo.full).toEqual(false);

  // B joins and leaves again before any device status was sent
  const websocketServiceB = new WebSocketService();
  const playerSessionServiceB = new PlayerSessionService(websocketServiceB);
  await websocketServiceB.connect();
  const partnerLeft = firstValueFrom(playerSessionServiceA.partnerEvents$.pipe(filter(connected => !connected)));
  expect((await playerSessionServiceB.enterSession(sessionInfo.id)).full).toEqual(true);
  playerSessionServiceB.leaveSession();
  await partnerLeft;

  // C takes the free spot and links with A
  const websocketServiceC = new WebSocketService();
  const playerSessionServiceC = new PlayerSessionService(websocketServiceC);
  const linkDeviceServiceMockC = new LinkDeviceServiceMock(celioDeviceC, celioDeviceA);
  const linkDeviceExchangeServiceC = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceC), new StatusEmitterLinkDevice(linkDeviceServiceMockC as any));
  await websocketServiceC.connect();
  expect((await playerSessionServiceC.enterSession(sessionInfo.id)).full).toEqual(true);

  await linkDeviceServiceMockA.connectDevice()
  await linkDeviceServiceMockC.connectDevice()
}));
