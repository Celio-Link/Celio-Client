import { test, expect } from "vitest";
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import { LinkDeviceExchangeService } from '../src/services/linkdeviceExchange.service';
import { LinkDeviceServiceMock, DataArray } from "./mocks/service/linkdevice.service.mock";
import { LoopbackDataGenerator } from './mocks/LoopbackDataGenerator';

test("Exchange Data", () => new Promise<void>(async done => {

  const successfulExchanges: number = 6
  let numberOfExchanges = 0;
  const LoopBackDataGeneratorA = new LoopbackDataGenerator((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchanges++;
    if (numberOfExchanges == successfulExchanges) done();
  })
  const LoopBackDataGeneratorB = new LoopbackDataGenerator((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchanges++;
    if (numberOfExchanges == successfulExchanges) done();
  })

  const websocketServiceA = new WebSocketService();
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
}));


