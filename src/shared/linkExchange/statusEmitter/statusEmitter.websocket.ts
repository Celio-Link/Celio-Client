import {StatusEmitterAbstract} from './statusEmitter.abstract';
import {Command, DATA_ARRAY_LENGTH, DataArray, LinkStatus, UInt8} from '../common';
import {Observable, Subject} from 'rxjs';

interface WsMessage {
  type: string;
  body: UInt8[] | string | number;
}

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
          resolve();
        };

        this.socket.onerror = () => {
          this.socket?.close();
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

          let message: WsMessage = JSON.parse(event.data);

          switch (message.type) {
            case "data":
              const buffer = message.body as UInt8[];

              const dataArray = Array.from({ length: DATA_ARRAY_LENGTH }, (_, i) =>
                buffer[i] as UInt8
              ) as DataArray;

              this.dataSubject.next(dataArray);
              break;
            case "status":
              this.statusSubject.next(Number(message.body as number) as LinkStatus);
              break;
            case "version":
              if (this.versionRequest && message.body as string == "0.3") {
                clearTimeout(this.versionRequest.timeout);
                this.versionRequest.resolve(true);
                this.versionRequest = undefined;
              }
              break;
          }
        }
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
      let wsMessage: WsMessage = {type: "versionRequest", body: ""}
      this.socket!.send(JSON.stringify(wsMessage));
    });
  }

  close$(): Observable<void> {
    return this.closeSubject.asObservable();
  }

  receiveCommand(command: Command): Promise<boolean> {
    if (this.socket?.readyState != this.socket?.OPEN) return Promise.resolve(false);
    let wsMessage: WsMessage = {type: "command", body: Array.from(command.serialize()) as UInt8[]}
    this.socket?.send(JSON.stringify(wsMessage));
    return Promise.resolve(true);
  }

  receiveData(data: DataArray): Promise<boolean> {
    if (this.socket?.readyState != this.socket?.OPEN) return Promise.resolve(false);
    let wsMessage: WsMessage = {type: "data", body: data}
    this.socket?.send(JSON.stringify(wsMessage))
    return Promise.resolve(true);
  }

  destroy(): void {
    console.log("Destroying websocket bridge...");
    this.retry = false;
    this.socket?.close();
  }
}
