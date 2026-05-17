import { Injectable } from '@angular/core';
import { Subject, Subscription} from 'rxjs';
import {Result} from 'true-myth';

import { WebSocketService } from './websocket.service';

export enum ErrorType {
  NotFound = "Session not found",
  AlreadyExists = "Already Exists"
}

interface SessionState {
  id: string;
  full: boolean;
}

@Injectable({  providedIn: 'root' })
export class PlayerSessionService {

  private reviveResult<T, E>(raw: any): Result<T, E> {
    if (raw && raw.variant === "Ok") return Result.ok(raw.value as T);
    if (raw && raw.variant === "Err") return Result.err(raw.error as E);
    throw new Error("Not a valid Result");
  }

  private inSession: boolean = false;
  private partnerEventSubject =  new Subject<boolean>();
  public partnerEvents$ = this.partnerEventSubject.asObservable();

  private sessionCloseSubject =  new Subject<void>();
  public sessionClose$ = this.sessionCloseSubject.asObservable();

  private socketEventHandlers: Record<string, (data?: any) => void> = {

    partnerJoined: () => {
      this.partnerEventSubject.next(true);
    },

    partnerLeft: () => {
      this.partnerEventSubject.next(false);
    },

    sessionClose: () => {
      this.inSession = false;
      this.sessionCloseSubject.next();
    }
  }

  private subscriptions = new Subscription();

  constructor( private websocketService: WebSocketService ) {
    Object.entries(this.socketEventHandlers).forEach(([event, handler]) => {
      const sub = this.websocketService.fromEvent(event).subscribe(value => handler(value));
      this.subscriptions.add(sub);
    });

    websocketService.onDisconnect$.subscribe(() => {this.inSession = false;})
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  enterSession(sessionId?: string): Promise<SessionState> {
    let eventString = "sessionCreate";
    let eventArgs: string | undefined = undefined;

    if (sessionId) {
      eventString = "sessionJoin";
      eventArgs = sessionId;
    }

    return new Promise((resolve, reject) => {
      this.websocketService.emit(eventString, eventArgs, (raw: any) => {
          const result: Result<SessionState, ErrorType> = this.reviveResult(raw)
          if (result.isOk) {
            this.inSession = true;
            resolve(result.value);
          } else {
            reject(result.error);
          }
        });
    });
  }

  /**
   * Leave the current session. Leaving without being in a session will do nothing.
   */
  leaveSession() {
    if (this.inSession) {
      this.inSession = false;
      this.websocketService.emit("sessionLeft");
    }
  }
}
