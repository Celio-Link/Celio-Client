import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import {CommandType, DataArray, FirmwareVersion, LinkStatus} from '../shared/linkExchange/common';

type Mode = 'usb' | 'serial';

// SerialLayer frame format (GBLink firmware):
//   | 0x47 0x42 | channel:1 | len:2 LE | payload[len] |
//     sync 'GB'   0=cmd,1=data,2=status
const SYNC_0 = 0x47;
const SYNC_1 = 0x42;
const CH_CMD = 0x00;
const CH_DATA = 0x01;
const CH_STATUS = 0x02;
const MAX_PAYLOAD = 64;

type RxState = 'sync1' | 'sync2' | 'channel' | 'lenLo' | 'lenHi' | 'payload';

@Injectable({  providedIn: 'root' })
export class LinkDeviceService {
  private device: USBDevice | undefined = undefined;
  private port: SerialPort | undefined = undefined;
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined = undefined;
  private writer: WritableStreamDefaultWriter<Uint8Array> | undefined = undefined;
  private mode: Mode | undefined = undefined;

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
  readonly serialOptions: SerialPortRequestOptions = {
    filters: [{ usbVendorId: 0x2fe3 }],
  };

  private statusEventSubject = new Subject<LinkStatus>();
  public statusEvents$ = this.statusEventSubject.asObservable();

  private dataEventSubject = new Subject<DataArray>();
  public dataEvents$ = this.dataEventSubject.asObservable();

  // Data-channel payloads that aren't 64-byte link packets — command replies
  // like GetFirmwareInfo (5 bytes: [0x0F, major, minor, patch, flags]).
  private dataRawEventSubject = new Subject<Uint8Array>();
  public dataRawEvents$ = this.dataRawEventSubject.asObservable();

  private disconnectEventSubject = new Subject<void>();
  public disconnectEvents$ = this.disconnectEventSubject.asObservable();

  // Framing parser state (serial only).
  private rxState: RxState = 'sync1';
  private rxChannel: number = 0;
  private rxLen: number = 0;
  private rxBuf: Uint8Array | null = null;
  private rxPos: number = 0;

  constructor() {
    if (typeof navigator !== 'undefined' && navigator.usb != undefined)
    {
      navigator.usb.ondisconnect = event => {
        if (this.mode === 'usb') {
          console.log("USB device disconnected:", event.device);
          this.device = undefined;
          this.mode = undefined;
          this.disconnectEventSubject.next()
        }
      };
    }
  }

  isConnected(): boolean {
    return this.mode === 'usb' ? this.device != undefined : this.port != undefined;
  }

  async connectDevice(kind: Mode = 'usb'): Promise<boolean> {
    if (kind === 'serial') return this.connectSerial();
    return this.connectUsb();
  }

  private async connectUsb(): Promise<boolean> {
    try {
      this.device = await navigator.usb.requestDevice(this.options);
      if (!this.device) return false;

      await this.device.open();
      await this.device.selectConfiguration(1);
      await this.device.claimInterface(0);

      this.mode = 'usb';
      this.readStatus();
      this.readData();

      return true;
    } catch (err) {
      console.log('USB connection to Celio Device failed', err);
      return false;
    }
  }

  private async connectSerial(): Promise<boolean> {
    try {
      this.port = await navigator.serial.requestPort(this.serialOptions);
      await this.port.open({ baudRate: 115200 });
      this.writer = this.port.writable!.getWriter();
      this.reader = this.port.readable!.getReader();

      this.mode = 'serial';
      this.rxState = 'sync1';
      this.runSerialReadLoop();
      return true;
    } catch (err) {
      console.log('Serial connection to Celio Device failed', err);
      this.port = undefined;
      this.reader = undefined;
      this.writer = undefined;
      return false;
    }
  }

  private async runSerialReadLoop() {
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value || value.length === 0) continue;
        for (let i = 0; i < value.length; i++) this.feedByte(value[i]);
      }
    } catch (e) {
      console.log('Serial read loop error:', e);
    } finally {
      if (this.mode === 'serial') {
        this.port = undefined;
        this.reader = undefined;
        this.writer = undefined;
        this.mode = undefined;
        this.disconnectEventSubject.next();
      }
    }
  }

  private feedByte(b: number) {
    switch (this.rxState) {
      case 'sync1':
        if (b === SYNC_0) this.rxState = 'sync2';
        break;
      case 'sync2':
        if (b === SYNC_1) this.rxState = 'channel';
        else if (b === SYNC_0) this.rxState = 'sync2';
        else this.rxState = 'sync1';
        break;
      case 'channel':
        this.rxChannel = b;
        this.rxState = 'lenLo';
        break;
      case 'lenLo':
        this.rxLen = b;
        this.rxState = 'lenHi';
        break;
      case 'lenHi':
        this.rxLen |= b << 8;
        if (this.rxLen > MAX_PAYLOAD) { this.rxState = 'sync1'; break; }
        this.rxPos = 0;
        this.rxBuf = new Uint8Array(this.rxLen);
        if (this.rxLen === 0) {
          this.dispatchFrame();
          this.rxState = 'sync1';
        } else {
          this.rxState = 'payload';
        }
        break;
      case 'payload':
        this.rxBuf![this.rxPos++] = b;
        if (this.rxPos >= this.rxLen) {
          this.dispatchFrame();
          this.rxState = 'sync1';
        }
        break;
    }
  }

  private dispatchFrame() {
    if (!this.rxBuf) return;
    if (this.rxChannel === CH_DATA && this.rxBuf.byteLength === 64) {
      const uint16Array = new Uint16Array(this.rxBuf.buffer, this.rxBuf.byteOffset, 32);
      const dataArray = Array.from(uint16Array) as DataArray;
      this.dataEventSubject.next(dataArray);
    } else if (this.rxChannel === CH_DATA && this.rxBuf.byteLength > 0) {
      this.dataRawEventSubject.next(this.rxBuf);
    } else if (this.rxChannel === CH_STATUS && this.rxBuf.byteLength === 2) {
      const status = new Uint16Array(this.rxBuf.buffer, this.rxBuf.byteOffset, 1);
      this.statusEventSubject.next(status[0] as LinkStatus);
    }
  }

  private async writeFrame(channel: number, payload: Uint8Array): Promise<boolean> {
    if (!this.writer) return false;
    if (payload.length > MAX_PAYLOAD) return false;
    const frame = new Uint8Array(5 + payload.length);
    frame[0] = SYNC_0;
    frame[1] = SYNC_1;
    frame[2] = channel;
    frame[3] = payload.length & 0xFF;
    frame[4] = (payload.length >> 8) & 0xFF;
    frame.set(payload, 5);
    try {
      await this.writer.write(frame);
      return true;
    } catch (e) {
      console.error('Serial write failed:', e);
      return false;
    }
  }

  private readData() {
    this.device!.transferIn(this.dataEndpoint, this.endPointBufferSize).then((result: USBInTransferResult) => {
      if (result.data && result.data.byteLength == 64) {
        const uint16Array = new Uint16Array(result.data.buffer, result.data.byteOffset, 32);
        const dataArray = Array.from(uint16Array) as DataArray;
        this.dataEventSubject.next(dataArray);
      } else if (result.data && result.data.byteLength > 0) {
        this.dataRawEventSubject.next(new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength));
      }
      if (this.mode === 'usb') this.readData()
    }, (err: Error) => {console.log(err)})
  }

  private readStatus() {
    this.device!.transferIn(this.statusEndpoint, this.endPointBufferSize).then((result: USBInTransferResult) => {
      if (result.data?.byteLength == 2) {
        const status = new Uint16Array(result.data.buffer);
        this.statusEventSubject.next(status[0] as LinkStatus)
        if (this.mode === 'usb') this.readStatus()
      }
    }, (err: Error) => {console.log(err)})
  }

  sendData(data: DataArray) : Promise<boolean> {
    const uint16Array = new Uint16Array(data);
    if (this.mode === 'serial') {
      return this.writeFrame(CH_DATA, new Uint8Array(uint16Array.buffer));
    }
    return this.device!.transferOut(this.dataEndpoint, uint16Array).then(
      (result: USBOutTransferResult) => {return true },
      (err: Error) => {console.log(err); return false;})
  }

  async sendDataRaw(data: Uint8Array): Promise<boolean> {
    if (data.length > 64) return false;
    if (this.mode === 'serial') {
      return this.writeFrame(CH_DATA, data);
    }
    try {
      await this.device!.transferOut(this.dataEndpoint, data);
      return true;
    } catch (error) {
      console.error("Error when sending raw data to device: " + JSON.stringify(error));
      return false;
    }
  }

  async sendCommand(command: CommandType, args: Uint8Array = new Uint8Array(0)): Promise<boolean> {
    let message: Uint8Array<ArrayBuffer> = new Uint8Array(1 + args.length);
    message[0] = command;
    message.set(args, 1)
    if (this.mode === 'serial') {
      return this.writeFrame(CH_CMD, message);
    }
    try {
      const result: USBOutTransferResult = await this.device!.transferOut(this.statusEndpoint, message);
      if (result.status != "ok") {
        console.log("Send Command to device result :" + JSON.stringify(result));
      }
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  // Query the firmware version (GetFirmwareInfo, 0x0F). The reply arrives on
  // the data channel, so subscribe before sending. Resolves undefined on
  // timeout — firmware too old to answer, or no device.
  getFirmwareVersion(timeoutMs: number = 1500): Promise<FirmwareVersion | undefined> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        subscription.unsubscribe();
        resolve(undefined);
      }, timeoutMs);
      const subscription = this.dataRawEvents$.subscribe(bytes => {
        if (bytes.length >= 4 && bytes[0] === CommandType.GetFirmwareInfo) {
          clearTimeout(timer);
          subscription.unsubscribe();
          resolve({ major: bytes[1], minor: bytes[2], patch: bytes[3] });
        }
      });
      this.sendCommand(CommandType.GetFirmwareInfo).then(sent => {
        if (!sent) {
          clearTimeout(timer);
          subscription.unsubscribe();
          resolve(undefined);
        }
      });
    });
  }

  async disconnect() {
    if (this.mode === 'serial') {
      try { if (this.reader) await this.reader.cancel(); } catch (_) {}
      try { this.reader?.releaseLock(); } catch (_) {}
      try { this.writer?.releaseLock(); } catch (_) {}
      try { await this.port?.close(); } catch (_) {}
      this.reader = undefined;
      this.writer = undefined;
      this.port = undefined;
      this.mode = undefined;
    } else if (this.mode === 'usb') {
      this.device!.close();
      this.device = undefined;
      this.mode = undefined;
    }
  }
}
