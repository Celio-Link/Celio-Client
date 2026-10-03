import {expect, test} from 'vitest';
import {DataArray, LinkDeviceServiceMock} from './mocks/service/linkdevice.service.mock';
import {WebSocketService} from '../src/services/websocket.service';
import {PlayerSessionService} from '../src/services/playersession.service';
import {LinkExchangeSession} from '../src/shared/linkExchange/linkExchangeSession';
import {CelioDeviceMock} from './mocks/celioDeviceMock';
import {CommandEmitterSocketIO} from '../src/shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {StatusEmitterLinkDevice} from '../src/shared/linkExchange/statusEmitter/statusEmitter.linkDevice';
import {DataPacket} from '../src/shared/linkExchange/common';

export class LinkDeviceExchangeMockDuplication extends LinkExchangeSession {

  override handleDeviceDataToSocket(data: DataArray) {
    let packet: DataPacket = new DataPacket(this.transmittedPacketCounter, data as any);
    this.commandEmitter.receiveData(packet);
    this.commandEmitter.receiveData(packet);
    this.transmittedPacketCounter++;
    console.log("Send data to socket " + JSON.stringify(packet))
  }

}

test("Exchange Data with repeated data packets", () => new Promise<void>(async done => {

  const successfulExchanges: number = 6
  let numberOfExchanges = 0;
  const celioDeviceA = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchanges++;
    if (numberOfExchanges == successfulExchanges) done();
  },10)
  const celioDeviceB = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchanges++;
    if (numberOfExchanges == successfulExchanges) done();
  },10)

  const websocketServiceA = new WebSocketService();
  const playerSessionServiceA = new PlayerSessionService(websocketServiceA);
  const linkDeviceServiceMockA = new LinkDeviceServiceMock(celioDeviceA, celioDeviceB);

  // Mock sends out packets twice instead of once
  const linkDeviceExchangeServiceA = new LinkDeviceExchangeMockDuplication(new CommandEmitterSocketIO(websocketServiceA), new StatusEmitterLinkDevice(linkDeviceServiceMockA as any));
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
