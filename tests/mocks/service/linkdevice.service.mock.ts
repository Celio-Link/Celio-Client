import { Injectable } from '@angular/core';
import {interval, map, Observable, repeat, repeatWhen, Subject, Subscriber, takeUntil} from 'rxjs';
import {ConnectionStatusMock} from '../ConnectionStatusMock';
import {LoopbackDataGenerator} from '../LoopbackDataGenerator';

export type UInt16 = number & { __uint16: true };
export type DataArray = [UInt16, UInt16, UInt16, UInt16, UInt16, UInt16, UInt16, UInt16];


export enum LinkStatus {

  HandshakeWaiting = 0xFF02,
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

  SetModeMaster = 0x10,
  SetModeSlave = 0x11,
  StartHandshake= 0x12,
  ConnectLink = 0x13
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

  public connectionStatus = new ConnectionStatusMock();

  private tick$: Observable<number>;

  constructor(private txLoopback: LoopbackDataGenerator, private rxLoopback: LoopbackDataGenerator,
              tickInterval: number = 100)
  {
    this.tick$ = interval(tickInterval);
  }

  isConnected(): boolean { return true }

  async sendData(receivedData: DataArray) : Promise<boolean> {
  try {
    this.rxLoopback.receivedData(receivedData);
    return true;
  } catch (err) {
    console.error("sendData failed:", err);
    throw err; // or return false if you prefer
  }
}

  async sendCommand(command: CommandType, args: Uint8Array = new Uint8Array(0)): Promise<boolean> {
    this.receivedCommands.push(command);
    this.connectionStatus.setCurrentCommand(command);
    return true
  }

  async connectDevice(): Promise<boolean>
  {
    this.tick$
      .pipe(
        takeUntil(this.connected$),
        repeatWhen(() => this.reconnect$)
      )
      .subscribe(value => {
        if (this.connectionStatus.isConnected()) {
          console.log("Connected");
          this.connected$.next();
          this.txLoopback.data$.subscribe(this.dataEventSubject);
        }
        else {
          let nextStatus = this.connectionStatus.getStatus();
          console.log("Next status: " + LinkStatus[nextStatus!]);
          if (nextStatus == undefined) return
          this.statusEventSubject.next(nextStatus)
        }
      })

    return true;
  }

}
