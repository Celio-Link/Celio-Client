import {expect, test} from 'vitest';
import {CommandType, DataArray, LinkDeviceServiceMock} from './mocks/service/linkdevice.service.mock';
import {WebSocketService} from '../src/services/websocket.service';
import {PlayerSessionService} from '../src/services/playersession.service';
import { LinkdeviceExchangeSession, StatusPacket } from '../src/pages/onlineLink/linkdeviceExchangeSession';
import {LinkStatus} from '../src/services/linkdevice.service';
import {v4 as uuidv4} from 'uuid';
import {CelioDeviceMock} from './mocks/celioDeviceMock';

export class LinkDeviceExchangeMockStatusDuplication extends LinkdeviceExchangeSession {
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
    this.websocketService.emit('deviceStatus', statusPacket);
    this.websocketService.emit('deviceStatus', statusPacket);
  }
}

test("Exchange Data with repeated command packets", () => new Promise<void>(async done => {

  const successfulExchanges: number = 6
  let numberOfExchanges = 0;
  const celioDeviceA = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchanges++;
    if (numberOfExchanges == successfulExchanges) done();
  })
  const celioDeviceB = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchanges++;
    if (numberOfExchanges == successfulExchanges) done();
  })

  const websocketServiceA = new WebSocketService();
  const playerSessionServiceA = new PlayerSessionService(websocketServiceA);
  const linkDeviceServiceMockA = new LinkDeviceServiceMock(celioDeviceA, celioDeviceB);

  celioDeviceA.onConnectedCallback = () => {
    expect([CommandType.SetModeMaster, CommandType.SetModeSlave]).toContain(celioDeviceA.commands[0])
    expect(celioDeviceA.commands.slice(1)).toEqual([CommandType.StartHandshake, CommandType.ConnectLink])
  }

  // Mock sends out packets twice instead of once
  const linkDeviceExchangeServiceA = new LinkDeviceExchangeMockStatusDuplication(websocketServiceA, linkDeviceServiceMockA as any);
  websocketServiceA.connect();
  let sessionInfo = await playerSessionServiceA.createSession()
  expect(sessionInfo.full).toEqual(false);

  const websocketServiceB = new WebSocketService();
  const playerSessionServiceB = new PlayerSessionService(websocketServiceB);
  const linkDeviceServiceMockB = new LinkDeviceServiceMock(celioDeviceB, celioDeviceA);

  celioDeviceB.onConnectedCallback = () => {
    expect([CommandType.SetModeMaster, CommandType.SetModeSlave]).toContain(celioDeviceB.commands[0])
    expect(celioDeviceB.commands.slice(1)).toEqual([CommandType.StartHandshake, CommandType.ConnectLink])
  }

  const linkDeviceExchangeServiceB = new LinkdeviceExchangeSession(websocketServiceB, linkDeviceServiceMockB as any);
  websocketServiceB.connect();
  sessionInfo = await playerSessionServiceB.joinSession(sessionInfo.id)
  expect(sessionInfo.full).toEqual(true);


  await linkDeviceServiceMockA.connectDevice()
  await linkDeviceServiceMockB.connectDevice()
}));
