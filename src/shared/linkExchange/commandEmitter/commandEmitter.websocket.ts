import {CommandEmitterAbstract} from './commandEmitter.abstract'
import {CommandType, DataArray, UInt8, DataPacket, StatusPacket, DATA_ARRAY_LENGTH, StartHandshakeCommand, ConnectLinkCommand} from '../common';
import {v4 as uuidv4} from 'uuid';

type Version = {
  major: number;
  minor: number;
  patch: number;
};

export class CommandEmitterWebsocket extends CommandEmitterAbstract {

  private socket: WebSocket | undefined
  private retry: boolean = true

  private sequence: number = 0

  private versionRequest?: {
    resolve: (value: boolean) => void;
    reject: (reason?: any) => void;
    timeout: ReturnType<typeof setTimeout>;
  };

  open(retryDelay = 1000): Promise<void> {
    return new Promise((resolve, reject) => {

      const connect = () => {
        console.log("Trying to connect...");

        try {
          this.socket = new WebSocket("http://localhost:51784", "celio_local");
        } catch (e) {
          if (this.retry) {
            console.log(`Retrying in ${retryDelay}ms...`);
            setTimeout(connect, retryDelay);
          }
          else{
            this.closeSubject.next();
            console.log("Connection closed");
          }
        }

        if (this.socket == undefined) return;

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

            const dataArray = Array.from({ length: DATA_ARRAY_LENGTH }, (_, i) =>
              view.getUint8(i) as UInt8
            ) as DataArray;

            this.dataSubject.next(new DataPacket(this.sequence, dataArray));
            this.sequence++;
          }
          else if (event.data === 'sessionClose') {
            this.destroy();
          }
          else if (event.data === '0.2') {
            if (this.versionRequest) {
              clearTimeout(this.versionRequest.timeout);
              this.versionRequest.resolve(true);
              this.versionRequest = undefined;
            }
          }
          else {
            // The bridge only sends the command number, so commands with args can't come from it
            const cmd = Number(event.data);
            const command = cmd === CommandType.StartHandshake ? new StartHandshakeCommand()
              : cmd === CommandType.ConnectLink ? new ConnectLinkCommand()
              : undefined;
            if (!command) {
              console.warn("Received unsupported command from websocket bridge: " + event.data);
              return;
            }
            this.commandSubject.next({ uuid: uuidv4(), command: command });
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

  receiveData(data: DataPacket) : void {
    const typedArray = new Uint8Array(data.data);
    if (this.socket?.readyState == this.socket?.OPEN) {
      this.socket?.send(typedArray)
    }
  }

  receiveStatus(status: StatusPacket) : void {
    if (this.socket?.readyState == this.socket?.OPEN) {
      this.socket?.send(status.linkStatus.toString())
    }
  }

  destroy() {
    console.log("Destroying websocket bridge...");
    this.retry = false;
    this.socket?.close();
  }
}
