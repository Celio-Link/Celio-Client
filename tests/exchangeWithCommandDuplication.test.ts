import {expect, test} from 'vitest';
import {CommandType, DataArray, LinkDeviceServiceMock} from './mocks/service/linkdevice.service.mock';
import {WebSocketService} from '../src/services/websocket.service';
import {PlayerSessionService} from '../src/services/playersession.service';
import { LinkExchangeSession } from '../src/shared/linkExchange/linkExchangeSession';
import {LinkStatus} from '../src/shared/linkExchange/common';
import {v4 as uuidv4} from 'uuid';
import {CelioDeviceMock} from './mocks/celioDeviceMock';
import {CommandEmitterSocketIO} from '../src/shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {StatusEmitterLinkDevice} from '../src/shared/linkExchange/statusEmitter/statusEmitter.linkDevice';
import {StatusPacket} from '../src/shared/linkExchange/common';

export class LinkDeviceExchangeMockStatusDuplication extends LinkExchangeSession {
  override handleDeviceStatusToSocket(status: LinkStatus) {
    console.log("Celio device has emitted a LinkStatus event: " + LinkStatus[status]);
    switch (status) {
      case LinkStatus.DeviceReady:
      case LinkStatus.EmuTradeSessionFinished:
      case LinkStatus.StatusDebug:
        return;
      default:
    }

    const statusPacket: StatusPacket = {uuid: uuidv4(), linkStatus: status};
    this.commandEmitter.receiveStatus(statusPacket);
    this.commandEmitter.receiveStatus(statusPacket);
  }
}

test("Exchange Data with repeated command packets", () => new Promise<void>(async done => {

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

  const websocketServiceA = new WebSocketService();
  const playerSessionServiceA = new PlayerSessionService(websocketServiceA);
  const linkDeviceServiceMockA = new LinkDeviceServiceMock(celioDeviceA, celioDeviceB);

  celioDeviceA.onConnectedCallback = () => {
    expect(celioDeviceA.commands).toEqual([CommandType.PlayerSettings, CommandType.StartHandshake, CommandType.ConnectLink])
    expect(celioDeviceA.playerCount).toEqual(2)
    expect([0, 1]).toContain(celioDeviceA.playerIndex)
  }

  // Mock sends out packets twice instead of once
  const linkDeviceExchangeServiceA = new LinkDeviceExchangeMockStatusDuplication(new CommandEmitterSocketIO(websocketServiceA), new StatusEmitterLinkDevice(linkDeviceServiceMockA as any));
  await websocketServiceA.connect();
  let sessionInfo = await playerSessionServiceA.createSession(2)
  expect(sessionInfo.full).toEqual(false);

  const websocketServiceB = new WebSocketService();
  const playerSessionServiceB = new PlayerSessionService(websocketServiceB);
  const linkDeviceServiceMockB = new LinkDeviceServiceMock(celioDeviceB, celioDeviceA);

  celioDeviceB.onConnectedCallback = () => {
    expect(celioDeviceB.commands).toEqual([CommandType.PlayerSettings, CommandType.StartHandshake, CommandType.ConnectLink])
    expect(celioDeviceB.playerCount).toEqual(2)
    expect([0, 1]).toContain(celioDeviceB.playerIndex)
  }

  const linkDeviceExchangeServiceB = new LinkExchangeSession(new CommandEmitterSocketIO(websocketServiceB), new StatusEmitterLinkDevice(linkDeviceServiceMockB as any));
  await websocketServiceB.connect();
  sessionInfo = await playerSessionServiceB.enterSession(sessionInfo.id)
  expect(sessionInfo.full).toEqual(true);


  await linkDeviceServiceMockA.connectDevice()
  await linkDeviceServiceMockB.connectDevice()
}));
