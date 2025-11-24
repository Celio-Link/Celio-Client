import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

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

export enum CommandType {
  SetMode = 0x00,
  Cancel = 0x01,
  SetModeMaster = 0x10,
  SetModeSlave = 0x11,
  StartHandshake= 0x12,
  ConnectLink = 0x13
}

export enum Mode {
  tradeEmu = 0x00,
  onlineLink = 0x01
}

export type StatusHandler = (status: LinkStatus) => void;

@Injectable({  providedIn: 'root',})
export class LinkDeviceService {
  private device: USBDevice | undefined = undefined;

  readonly statusEndpoint: number = 1
  readonly dataEndpoint: number = 2
  readonly endPointBufferSize: number = 64
  readonly options: USBDeviceRequestOptions = {
    filters: [
      { vendorId: 0x2fe3, productId: 0x0100 },
      { vendorId: 0x2fe3, productId: 0x00a },
      { vendorId: 0x8086, productId: 0xf8a1 },
    ],
  };

  private statusEventSubject = new Subject<LinkStatus>();
  public statusEvents$ = this.statusEventSubject.asObservable();

  private dataEventSubject = new Subject<DataArray>();
  public dataEvents$ = this.dataEventSubject.asObservable();

  private disconnectEventSubject = new Subject<void>();
  public disconnectEvents$ = this.disconnectEventSubject.asObservable();

  constructor() {
    navigator.usb.ondisconnect = event => {
      console.log("USB device disconnected:", event.device);
      this.device = undefined;
      this.disconnectEventSubject.next()
    };
  }

  isConnected(): boolean { return this.device != undefined; }

  async connectDevice(): Promise<boolean> {

    try {
      this.device = await navigator.usb.requestDevice(this.options);

      if (!this.device) return false;

      await this.device.open();
      await this.device.selectConfiguration(1);
      await this.device.claimInterface(0);

      this.readStatus();
      this.readData();

      return true; // Everything went OK
    } catch (err) {
      console.log('USB connection to Celio Device failed', err);
      return false;
    }
  }

  readData() {
    this.device!.transferIn(this.dataEndpoint, this.endPointBufferSize).then((result: USBInTransferResult) => {
      if (result.data?.byteLength == 16) {
        const uint16Array = new Uint16Array(result.data.buffer, result.data.byteOffset, 8);
        const dataArray = Array.from(uint16Array) as DataArray;
        this.dataEventSubject.next(dataArray);
        this.readData()
      }
    }, (err: Error) => {console.log(err)})
  }

  readStatus() {
    this.device!.transferIn(this.statusEndpoint, this.endPointBufferSize).then((result: USBInTransferResult) => {
      if (result.data?.byteLength == 2) {
        const status = new Uint16Array(result.data.buffer);
        this.statusEventSubject.next(status[0] as LinkStatus)
        this.readStatus()
      }
    }, (err: Error) => {console.log(err)})
  }

  sendData(data: DataArray) : Promise<boolean> {
    const uint16Array = new Uint16Array(data);
    return this.device!.transferOut(this.dataEndpoint, uint16Array).then(
      (result: USBOutTransferResult) => {console.log(result); return true },
      (err: Error) => {console.log(err); return false;})
  }

  async sendDataRaw(data: Uint8Array): Promise<boolean> {
    if (data.length > 64) return false;
    try {
      const result: USBOutTransferResult =
        await this.device!.transferOut(this.dataEndpoint, data);
      console.log("Send raw data to device result: " + result);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async sendCommand(command: CommandType, args: Uint8Array = new Uint8Array(0)): Promise<boolean> {
    let message: Uint8Array<ArrayBuffer> = new Uint8Array(1 + args.length);
    message[0] = command;
    message.set(args, 1)
    try {
      const result: USBOutTransferResult = await this.device!.transferOut(this.statusEndpoint, message);
      console.log("Send Command to device result :" + result);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  disconnect() {
    this.device!.close();
  }
}
