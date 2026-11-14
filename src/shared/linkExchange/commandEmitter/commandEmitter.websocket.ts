import {CommandEmitterAbstract} from './commandEmitter.abstract'
import {CommandType, DataArray, UInt8, DataPacket, StatusPacket, DATA_ARRAY_LENGTH, Command} from '../common';
import {v4 as uuidv4} from 'uuid';

interface WsCommand {
  commandType: CommandType;
  args?: any;
}

interface WsMessage {
  type: string;
  body: UInt8[] | string | number | WsCommand;
}

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

          let message: WsMessage = JSON.parse(event.data);

          switch (message.type) {
            case "data":
              const buffer = message.body as UInt8[];

              const dataArray = Array.from({ length: DATA_ARRAY_LENGTH }, (_, i) =>
                buffer[i] as UInt8
              ) as DataArray;

              this.dataSubject.next(new DataPacket(this.sequence, dataArray));
              this.sequence++;
              break;

            case "command":
                let rawCommand = message.body as WsCommand;
                let command = Command.fromServer(rawCommand.commandType, rawCommand.args);
                if (command == undefined) return;
                this.commandSubject.next({ uuid: uuidv4(), command: command });
              break;

            case "version":
              console.log(event.data);
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

  receiveData(data: DataPacket) : void {
    if (this.socket?.readyState != this.socket?.OPEN) return;
    let wsMessage: WsMessage = {type: "data", body: data.data}
    this.socket?.send(JSON.stringify(wsMessage))
  }

  receiveStatus(status: StatusPacket) : void {
    if (this.socket?.readyState != this.socket?.OPEN) return;
    let wsMessage: WsMessage = {type: "status", body: status.linkStatus}
    this.socket?.send(JSON.stringify(wsMessage))
  }

  destroy() {
    console.log("Destroying websocket bridge...");
    this.retry = false;
    this.socket?.close();
  }
}
