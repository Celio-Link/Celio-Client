import { test, expect } from "vitest";
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import { LinkExchangeSession } from '../src/shared/linkExchange/linkExchangeSession';
import { LinkDeviceServiceMock, DataArray } from "./mocks/service/linkdevice.service.mock";
import { CelioDeviceMock } from './mocks/celioDeviceMock';
import {CommandEmitterSocketIO} from '../src/shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {StatusEmitterLinkDevice} from '../src/shared/linkExchange/statusEmitter/statusEmitter.linkDevice';

/**
 * Loses the first device command sent by the server, like a command emitted into a dead connection.
 */
class CommandLosingWebSocketService extends WebSocketService {

  constructor() {
    super();
    const socket: any = this.socket;
    const onevent = socket.onevent.bind(socket);
    let commandLost = false;
    socket.onevent = (packet: any) => {
      if (!commandLost && packet.data[0] === 'deviceCommand') {
        commandLost = true;
        console.warn("Losing device command: " + JSON.stringify(packet.data[1]));
        return;
      }
      onevent(packet);
    };
  }
}

test("Exchange Data with lost command", {timeout: 10000}, () => new Promise<void>(async done => {

  const successfulExchanges: number = 6
  let numberOfExchanges = 0;
  const celioDeviceA = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchanges++;
    if (numberOfExchanges == successfulExchanges) done();
  }, 10)
  const celioDeviceB = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchanges++;
    if (numberOfExchanges == successfulExchanges) done();
  }, 10)

  const websocketServiceA = new CommandLosingWebSocketService();
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
}));
