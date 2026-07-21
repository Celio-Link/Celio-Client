import {StatusEmitterAbstract} from './statusEmitter.abstract';
import {CommandType, DataArray, LinkStatus, UInt16} from '../common';
import {Observable, Subject} from 'rxjs';

export class StatusEmitterWebsocket extends StatusEmitterAbstract {

  protected readonly closeSubject = new Subject<void>();
  private socket: WebSocket | undefined
  private retry: boolean = true

  private versionRequest?: {
    resolve: (value: boolean) => void;
    reject: (reason?: any) => void;
    timeout: ReturnType<typeof setTimeout>;
  };

  open(retryDelay = 1000): Promise<void> {
    return new Promise((resolve, reject) => {

      const connect = () => {
        console.log("Trying to connect...");

        this.socket = new WebSocket("http://localhost:51784", "celio_online");

        this.socket.onopen = () => {
          console.log("Connected!");
          this.retry = false;
          this.socket!.binaryType = "arraybuffer";
          resolve();
        };

        this.socket.onerror = () => {
          this.socket?.close(); // ensures onclose fires
        };

        this.socket.onclose = () => {
          if (this.retry) {
            console.log(`Retrying in ${retryDelay}ms...`);
            setTimeout(connect, retryDelay);
          }
          else{
            this.closeSubject.next();
            console.log("Connection closed");
          }
        };

        this.socket.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {

            const buffer = event.data as ArrayBuffer;
            const view = new DataView(buffer);

            const dataArray = Array.from({ length: 32 }, (_, i) =>
              view.getUint16(i * 2, false) as UInt16 // false = big-endian
            ) as DataArray;

            this.dataSubject.next(dataArray);
          }
          else if (event.data === '0.2') {
            if (this.versionRequest) {
              clearTimeout(this.versionRequest.timeout);
              this.versionRequest.resolve(true);
              this.versionRequest = undefined;
            }
          }
          else {
            this.statusSubject.next(Number(event.data) as LinkStatus);
          }
        };
      }

      connect();
    })
  }

  /*
  this version check is an absolute disgrace in terms of code quality, but the way the socket protocol ic currently
  structured leaves no other way.

  DO NOT TAKE THIS AS AN EXAMPLE, IT IS A HORRIBLE WAY TO DO THIS AND WILL BE REMOVED IN THE FUTURE
  */
  checkVersion(): Promise<boolean> {
    if (!this.socket) {
      return Promise.reject(new Error("Socket not connected"));
    }

    return new Promise((resolve, reject) => {
      this.versionRequest = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.versionRequest = undefined;
          resolve(false);
        }, 1000),
      };
      this.socket!.send("getVersion");
    });
  }

  close$(): Observable<void> {
    return this.closeSubject.asObservable();
  }

  receiveCommand(command: CommandType, args: Uint8Array): Promise<boolean> {
    if (this.socket?.readyState == this.socket?.OPEN) this.socket?.send(command.toString())
    return Promise.resolve(true);
  }

  receiveData(data: DataArray): Promise<boolean> {
    const typedArray = new Uint16Array(data);
    if (this.socket?.readyState == this.socket?.OPEN) this.socket?.send(typedArray)
    return Promise.resolve(true);
  }

  destroy(): void {
    console.log("Destroying websocket bridge...");
    this.retry = false;
    this.socket?.close();
  }
}
