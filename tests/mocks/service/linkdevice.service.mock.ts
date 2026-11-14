import { Injectable } from '@angular/core';
import {interval, map, Observable, repeat, repeatWhen, Subject, Subscriber, takeUntil} from 'rxjs';
import {CelioDeviceMock} from '../celioDeviceMock';
import {Command, DataArray} from '../../../src/shared/linkExchange/common';

export type {DataArray, UInt8} from '../../../src/shared/linkExchange/common';


export enum LinkStatus {

  AwaitMode = 0xFF02,

  HandshakeReceived = 0xFF03,
  HandshakeFinished = 0xFF04,

  LinkConnected = 0xFF05,
  LinkReconnecting = 0xFF06,
  LinkClosed = 0xFF07,

  DeviceReady = 0xFF08,
  EmuTradeSessionFinished = 0xFF09,

  StatusDebug = 0xFFFF
}

export enum CommandType
{
  Empty = 0xFF,
  SetMode = 0x00,
  Cancel = 0x01,

  PlayerSettings = 0x10,
  StartHandshake= 0x12,
  ConnectLink = 0x13,

  MockCloseLink = 0xC7
}

export enum Mode
{
  tradeEmu = 0x00,
  onlineLink = 0x01
}

@Injectable({  providedIn: 'root',})
export class LinkDeviceServiceMock {

  connected$: Subject<void> = new Subject()
  reconnect$: Subject<void> = new Subject()

  private statusEventSubject = new Subject<LinkStatus>();
  public statusEvents$ = this.statusEventSubject.asObservable();

  private dataEventSubject = new Subject<DataArray>();
  public dataEvents$ = this.dataEventSubject.asObservable();

  public receivedCommands: CommandType[] = [];

  constructor(private localCelioDevice: CelioDeviceMock, private remoteCelioDevice: CelioDeviceMock)
  {}

  isConnected(): boolean { return true }

  async sendData(receivedData: DataArray) : Promise<boolean> {
  try {
    this.remoteCelioDevice.receivedData(receivedData);
    return true;
  } catch (err) {
    console.error("sendData failed:", err);
    throw err; // or return false if you prefer
  }
}

  async sendCommand(command: Command): Promise<boolean> {
    // The device only gets the serialized bytes, like the real one
    const [type, ...payload] = command.serialize();
    this.receivedCommands.push(type);
    this.localCelioDevice.setCurrentCommand(type, Uint8Array.from(payload));
    return true
  }

  async connectDevice(): Promise<boolean>
  {
    this.localCelioDevice.status$.subscribe(this.statusEventSubject);
    this.localCelioDevice.data$.subscribe(this.dataEventSubject);

    return true;
  }

}
