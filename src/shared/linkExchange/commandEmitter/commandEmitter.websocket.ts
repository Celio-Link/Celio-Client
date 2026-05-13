import {CommandEmitterAbstract} from './commandEmitter.abstract'
import {CommandType, DataArray, UInt16, CommandPacket, DataPacket, StatusPacket} from '../common';
import {v4 as uuidv4} from 'uuid';

export class CommandEmitterWebsocket extends CommandEmitterAbstract {

  private socket: WebSocket | undefined
  private retry: boolean = true

  private sequence: number = 0

  open(retryDelay = 1000): Promise<void> {
    return new Promise((resolve, reject) => {

      const connect = () => {
        console.log("Trying to connect...");

        this.socket = new WebSocket("http://localhost:51784", "celio_local");

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

            this.dataSubject.next(new DataPacket(this.sequence, dataArray));
            this.sequence++;
          }
          else if (event.data === 'sessionClose') {
            this.destroy();
          }
          else {
            const cmd = Number(event.data) as CommandType
            const commandPacket: CommandPacket = { uuid: uuidv4(), command: cmd };
            this.commandSubject.next(commandPacket);
          }
        };
      }

      connect();
    })
  }

  receiveData(data: DataPacket) : void {
    const typedArray = new Uint16Array(data.data);
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
