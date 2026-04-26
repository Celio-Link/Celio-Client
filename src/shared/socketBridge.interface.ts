import {CommandType, DataArray, LinkStatus} from '../services/linkdevice.service';
import {Observable} from 'rxjs';

export interface CommandPacket {
  uuid: string;
  command: CommandType;
}

export interface StatusPacket {
  uuid: string;
  linkStatus: LinkStatus;
}

export class DataPacket {
  public sequence: number;
  public data: DataArray;

  constructor(sequence: number, data: DataArray) {
    this.sequence = sequence;
    this.data = data;
  }

  private dataToString(): string {
    let out = "";
    for (let i = 0; i < this.data.length; i++) {
      if (i) out += " ";
      if (i % 8 == 0) out += "\n";
      out += "0x" + (this.data[i] & 0xffff).toString(16).padStart(4, "0").toUpperCase();
    }
    return out;
  }

  toString(): string {
    return "Sequence = " + this.sequence + this.dataToString();
  }
}

export interface ISocketBridge {

  data$(): Observable<DataPacket>;
  command$(): Observable<CommandPacket>;
  close$(): Observable<void>;

  sendData(data: DataPacket): void;
  sendStatus(status: StatusPacket): void;
  destroy(): void;
}
