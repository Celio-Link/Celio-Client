import {CommandType, DataArray, LinkStatus, UInt16} from './service/linkdevice.service.mock';
import {finalize, from, interval, map, Observable, Subject, Subscriber, switchMap, zipWith} from 'rxjs';
import {v4 as uuidv4} from 'uuid';

export class CelioDeviceMock {

  public readonly data$: Observable<DataArray>;
  public readonly status$: Observable<LinkStatus>;

  private handshakeComplete$ = new Subject<void>();

  private currentStatus: LinkStatus | undefined = LinkStatus.AwaitMode;
  public commands: CommandType[] = [];

  public onConnectedCallback: () => void = () => {};
  public onLinkCloseCallback: () => void = () => {};

  private id = uuidv4();

  private index = 0;

  private randomUInt16(): UInt16 {
    return (Math.floor(Math.random() * 0x10000) & 0xffff) as UInt16;
  }

  private randomDataArray(secondSlot: UInt16): DataArray {
    return [
      this.randomUInt16(),secondSlot , this.randomUInt16(), this.randomUInt16(),
      this.randomUInt16(), this.randomUInt16(), this.randomUInt16(), this.randomUInt16(),
    ];
  }

  private data: DataArray[] = []

  constructor(protected receiveCallback: (received: DataArray, history: DataArray) => void,
              numberOfEmits: number, private intervalMs = 500) {

    for (let i = 0; i < numberOfEmits; i++) {
      this.data.push(this.randomDataArray(i as UInt16));
    }

    //sentinel
    this.data.push([0 as UInt16, 0 as UInt16, 0 as UInt16, 0 as UInt16,
                    0 as UInt16, 0 as UInt16, 0 as UInt16, 0 as UInt16,
    ])

    this.data$ = this.handshakeComplete$.pipe(
      switchMap(() =>
        from(this.data).pipe(
          zipWith(interval(this.intervalMs)),
          map(([dataItem]) => dataItem),
          finalize(() => {
            this.setCurrentCommand(CommandType.MockCloseLink);
          })
        )
      )
    );

    this.status$ = new Observable<LinkStatus>((subscriber: Subscriber<LinkStatus>) => {
      const subscription = interval(this.intervalMs).subscribe(() => {
        console.log("Celio device '" + this.id+ "' has emitted a LinkStatus event: " + LinkStatus[this.currentStatus!]);
        if (!this.currentStatus) return
        subscriber.next(this.currentStatus!);
        this.currentStatus = undefined;
      })

      return () => subscription.unsubscribe();
    });
  }

  receivedData(receivedData: DataArray) {
    if (this.index == this.data.length - 1) {
      this.index = 0;
    }
    let sendData = this.data[this.index]!;
    this.index++;
    this.receiveCallback(receivedData, sendData);
  }

  restart() {
    this.currentStatus = LinkStatus.AwaitMode;
  }

  setCurrentCommand(command: CommandType) {

    this.commands.push(command);

    switch (command) {
      case CommandType.SetModeMaster:
      case CommandType.SetModeSlave:
        this.currentStatus = LinkStatus.HandshakeReceived;
        break;

      case CommandType.StartHandshake:
        this.currentStatus = LinkStatus.HandshakeFinished;
        setTimeout(() => {
          this.currentStatus = LinkStatus.LinkConnected;
        }, this.intervalMs);
        break;

      case CommandType.ConnectLink:
        this.handshakeComplete$.next();
        this.onConnectedCallback();
        break;

      case CommandType.MockCloseLink:
        this.onLinkCloseCallback();
        this.currentStatus = LinkStatus.LinkClosed;
    }

  }
}
