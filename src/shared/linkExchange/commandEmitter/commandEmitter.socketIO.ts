import {CommandPacket, DataPacket, StatusPacket} from '../common'
import {CommandEmitterAbstract} from './commandEmitter.abstract'
import {concatMap, Subject, Subscription} from 'rxjs';
import {WebSocketService} from '../../../services/websocket.service';

const MAX_DATA_BATCH_SIZE = 1024;

export class CommandEmitterSocketIO extends CommandEmitterAbstract {

  private subscriptions = new Subscription();

  // Status packets are sent one by one and right away
  private status$ = new Subject<StatusPacket>();

  // Data packets are sent in batches with only one batch in flight. Packets queued while a batch is in flight
  // are sent together as the next batch once the previous one is done.
  private dataQueue: DataPacket[] = [];
  private dataInFlight: boolean = false;
  private destroyed: boolean = false;

  constructor(protected websocketService: WebSocketService) {

    super();
    this.subscriptions.add(
      this.status$.pipe(
        concatMap((status: StatusPacket) => this.emitWithRetry('deviceStatus', status))
      ).subscribe()
    );

    this.subscriptions.add(
      this.websocketService
        .fromEventWithAck<DataPacket[]>('deviceData')
        .subscribe(({data, ack}) => {
          ack(true);
          data.forEach(packet => this.dataSubject.next(packet));
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
    if (this.destroyed) return;
    this.dataQueue.push(data);
    this.sendQueuedData();
  }

  receiveStatus(status: StatusPacket) : void {
    this.status$.next(status);
  }

  private sendQueuedData() {
    if (this.destroyed || this.dataInFlight || this.dataQueue.length === 0) return;

    const batch = this.dataQueue.splice(0, MAX_DATA_BATCH_SIZE);
    this.dataInFlight = true;
    this.emitWithRetry('deviceData', batch).finally(() => {
      this.dataInFlight = false;
      this.sendQueuedData();
    });
  }

  private emitWithRetry(event: string, data: DataPacket[] | StatusPacket): Promise<void> {
    return this.websocketService.emitWithRetry(event, data)
      .then(
        (acked) => {
          if (acked !== true) console.warn("Server rejected " + event + ": " + JSON.stringify(data));
        },
        (err) => console.error("Ack for " + event + " failed after retries:", err)
      );
  }

  destroy() {
    this.destroyed = true;
    this.dataQueue = [];
    this.subscriptions.unsubscribe();
  }

}
