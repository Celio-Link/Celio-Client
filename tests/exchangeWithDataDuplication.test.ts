import {expect, test} from 'vitest';
import {DataArray, LinkDeviceServiceMock} from './mocks/service/linkdevice.service.mock';
import {WebSocketService} from '../src/services/websocket.service';
import {PlayerSessionService} from '../src/services/playersession.service';
import {LinkExchangeSession} from '../src/shared/linkExchange/linkExchangeSession';
import {CelioDeviceMock} from './mocks/celioDeviceMock';
import {CommandEmitterSocketIO} from '../src/shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {DataPacket} from '../src/shared/linkExchange/commandEmitter/commandEmitter.abstract';

export class LinkDeviceExchangeMockDuplication extends LinkExchangeSession {

  override handleDeviceDataToSocket(data: DataArray) {
    const queued = this.deviceQueue.shift();
    console.log("Device queue status: " + JSON.stringify(this.deviceQueue));
    if (queued) {
      this.linkDeviceService.sendData(queued).then(
        () => console.log("Transmit data to device: ", queued),
        () => {
          console.log("Transmit data to device: ERROR, Unshift data to queue...");
          this.deviceQueue.unshift(queued);
        }
      );
    }

    if (data[0] == 0x00) return;
    if ((data[0] == 0xCAFE) && (data[1] == 0x11)) return;

    let packet: DataPacket = new DataPacket(this.transmittedPacketCounter, data);
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
  const linkDeviceExchangeServiceA = new LinkDeviceExchangeMockDuplication(new CommandEmitterSocketIO(websocketServiceA), linkDeviceServiceMockA as any);
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
}));
