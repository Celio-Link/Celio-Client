import { Injectable } from '@angular/core';
import { Subject, Subscription} from 'rxjs';
import {Result} from 'true-myth';

import { WebSocketService } from './websocket.service';

import {
  JoinMessage,
  SessionCreationMessage
} from '../client/messenges';

enum ErrorType {
  NotFound = "Not Found",
  AlreadyExists = "AlreadyExists"
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

  private joinMessage: SessionCreationMessage | JoinMessage | undefined = undefined;

  private partnerEventSubject =  new Subject<boolean>();
  public partnerEvents$ = this.partnerEventSubject.asObservable();

  private socketEventHandlers: Record<string, (data?: any) => void> = {

    partnerJoined: () => {
      this.partnerEventSubject.next(true);
    },

    partnerLeft: () => {
      this.partnerEventSubject.next(false);
    }
  }

  private subscriptions = new Subscription();

  constructor( private websocketService: WebSocketService ) {
    Object.entries(this.socketEventHandlers).forEach(([event, handler]) => {
      const sub = this.websocketService.fromEvent(event).subscribe(value => handler(value));
      this.subscriptions.add(sub);
    });
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  createSession(): Promise<SessionState> {
    this.joinMessage = { type: 'sessionCreate' };
    return new Promise((resolve, reject) => {
      this.websocketService.emit("sessionCreate", this.joinMessage!,
        (raw: any) => {
          const result: Result<SessionState, ErrorType> = this.reviveResult(raw)
          if (result.isOk) {
            resolve(result.value);
          } else {
            reject(result.error);
          }
        }
      );
    });
  }

  joinSession(sessionId: string): Promise<SessionState> {
    this.joinMessage = { type: 'sessionJoin', id: sessionId };
    return new Promise((resolve, reject) => {
      this.websocketService.emit("sessionJoin", this.joinMessage!,
        (raw: any) => {
          const result: Result<SessionState, ErrorType> = this.reviveResult(raw)
          if (result.isOk) {
            resolve(result.value);
          } else {
            reject(result.error);
          }
        }
      );
    });
  }

  leaveSession() {
    this.websocketService.emit("sessionLeft");
  }
}
