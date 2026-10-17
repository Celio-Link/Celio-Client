import {Observable, Subject} from 'rxjs';
import {Command, DataArray, LinkStatus} from '../common';

export abstract class StatusEmitterAbstract {

  protected readonly statusSubject = new Subject<LinkStatus>();
  protected readonly dataSubject = new Subject<DataArray>();

  public data$(): Observable<DataArray> {
    return this.dataSubject.asObservable();
  }

  public status$(): Observable<LinkStatus> {
    return this.statusSubject.asObservable();
  }

  abstract receiveData(data: DataArray): Promise<boolean>;

  abstract receiveCommand(command: Command): Promise<boolean>;

  abstract destroy(): void;
}
