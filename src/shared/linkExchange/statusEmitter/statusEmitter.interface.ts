import {Observable} from 'rxjs';
import {CommandPacket, CommandType, DataArray, DataPacket, LinkStatus, StatusPacket} from '../common';

export interface StatusEmitterInterface {

  data$(): Observable<DataArray>;

  status$(): Observable<LinkStatus>;

  sendData(data: DataArray): Promise<boolean>;

  sendCommand(command: CommandType, args: Uint8Array): Promise<boolean>;

  destroy(): void;
}
