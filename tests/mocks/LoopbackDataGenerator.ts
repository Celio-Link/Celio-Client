import {interval, map, Observable, Subscriber} from 'rxjs';
import {DataArray, UInt16} from './service/linkdevice.service.mock';

export class LoopbackDataGenerator {
  protected history: DataArray[] = [];
  public readonly data$: Observable<DataArray>;

  private randomUInt16(): UInt16 {
    return (Math.floor(Math.random() * 0x10000) & 0xffff) as UInt16;
  }

  private randomDataArray(): DataArray {
    return [
      this.randomUInt16(), this.randomUInt16(), this.randomUInt16(), this.randomUInt16(),
      this.randomUInt16(), this.randomUInt16(), this.randomUInt16(), this.randomUInt16(),
    ];
  }

  constructor(protected receiveCallback: (received: DataArray, history: DataArray) => void , private intervalMs = 500) {
    this.data$ = new Observable<DataArray>((subscriber: Subscriber<DataArray>) => {
      const subscription = interval(this.intervalMs).pipe(
        map(() => this.randomDataArray())
      ).subscribe(value => {
        this.history.push(value);
        subscriber.next(value);
      })

      return () => subscription.unsubscribe();
    });
  }

  receivedData(receivedData: DataArray) {
    let sendData = this.history.shift()!
    this.receiveCallback(receivedData, sendData);
  }
}
