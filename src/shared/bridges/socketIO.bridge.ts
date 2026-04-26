import {CommandPacket, DataPacket, ISocketBridge, StatusPacket} from '../socketBridge.interface'
import {Observable, Subject, Subscription} from 'rxjs';
import {WebSocketService} from '../../services/websocket.service';

export class SocketIOBridge implements ISocketBridge {

  private subscriptions = new Subscription();
  private readonly closeSubject = new Subject<void>();
  private readonly commandSubject = new Subject<CommandPacket>();
  private readonly dataSubject = new Subject<DataPacket>();

  constructor(protected websocketService: WebSocketService) {

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

  data$(): Observable<DataPacket> {
    return this.dataSubject.asObservable();
  }

  command$(): Observable<CommandPacket> {
    return this.commandSubject.asObservable();
  }

  close$(): Observable<void> {
    return this.closeSubject.asObservable();
  }

  sendData(data: DataPacket) : void {
    this.websocketService.emit('deviceData', data);
  }

  sendStatus(status: StatusPacket) : void {
    this.websocketService.emit('deviceStatus', status);
  }

  destroy() {
    this.subscriptions.unsubscribe();
  }

}
