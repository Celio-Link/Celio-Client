import {expect, test} from 'vitest';
import {DataArray, LinkDeviceServiceMock} from './mocks/service/linkdevice.service.mock';
import {WebSocketService} from '../src/services/websocket.service';
import {PlayerSessionService} from '../src/services/playersession.service';
import {DataPacket, LinkdeviceExchangeSession} from '../src/pages/onlineLink/linkdeviceExchangeSession';
import {CelioDeviceMock} from './mocks/celioDeviceMock';

export class LinkDeviceExchangeMockDuplication extends LinkdeviceExchangeSession {

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

    let packet: DataPacket = {sequence: this.transmittedPacketCounter, data: data};
    this.websocketService.emit('deviceData', packet);
    this.websocketService.emit('deviceData', packet);
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
  })
  const celioDeviceB = new CelioDeviceMock((received: DataArray, history: DataArray) => {
    expect(received).toEqual(history)
    numberOfExchanges++;
    if (numberOfExchanges == successfulExchanges) done();
  })

  const websocketServiceA = new WebSocketService();
  const playerSessionServiceA = new PlayerSessionService(websocketServiceA);
  const linkDeviceServiceMockA = new LinkDeviceServiceMock(celioDeviceA, celioDeviceB);

  // Mock sends out packets twice instead of once
  const linkDeviceExchangeServiceA = new LinkDeviceExchangeMockDuplication(websocketServiceA, linkDeviceServiceMockA as any);
  websocketServiceA.connect();
  let sessionInfo = await playerSessionServiceA.createSession()
  expect(sessionInfo.full).toEqual(false);

  const websocketServiceB = new WebSocketService();
  const playerSessionServiceB = new PlayerSessionService(websocketServiceB);
  const linkDeviceServiceMockB = new LinkDeviceServiceMock(celioDeviceB, celioDeviceA);
  const linkDeviceExchangeServiceB = new LinkdeviceExchangeSession(websocketServiceB, linkDeviceServiceMockB as any);
  websocketServiceB.connect();
  sessionInfo = await playerSessionServiceB.joinSession(sessionInfo.id)
  expect(sessionInfo.full).toEqual(true);

  await linkDeviceServiceMockA.connectDevice()
  await linkDeviceServiceMockB.connectDevice()
}));
