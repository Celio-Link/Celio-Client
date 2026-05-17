import {CommandPacket, DataPacket, StatusPacket} from '../common'
import {CommandEmitterAbstract} from './commandEmitter.abstract'
import {Subscription} from 'rxjs';
import {WebSocketService} from '../../../services/websocket.service';

export class CommandEmitterSocketIO extends CommandEmitterAbstract {

  private subscriptions = new Subscription();

  constructor(protected websocketService: WebSocketService) {

    super();
    this.subscriptions.add(
      this.websocketService
        .fromEventWithAck<DataPacket>('deviceData')
        .subscribe(({data, ack}) => {
          ack(true); //FIXME better ack handling
          this.dataSubject.next(data);
        })
    );

    this.subscriptions.add(
      this.websocketService
        .fromEvent<CommandPacket>('deviceCommand')
        .subscribe((commandPacket: CommandPacket) => {
          this.commandSubject.next(commandPacket);
        })
    );

    this.subscriptions.add(
      this.websocketService
        .fromEvent<void>('sessionClose')
        .subscribe(() => {
          console.log("LinkSession: Unsubscribing from events...");
          this.closeSubject.next();
          this.destroy();
        })
    );

  }

  receiveData(data: DataPacket) : void {
    this.websocketService.emit('deviceData', data);
  }

  receiveStatus(status: StatusPacket) : void {
    this.websocketService.emit('deviceStatus', status);
  }

  destroy() {
    this.subscriptions.unsubscribe();
  }

}
