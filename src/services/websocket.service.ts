import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import {firstValueFrom, fromEvent, map, Observable, race, take} from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { environment } from '../environments/environment';

@Injectable({  providedIn: 'root',})
export class WebSocketService {

  protected socket: Socket = io(environment.apiUrl, {
    transports: ["websocket"],
    autoConnect: false,
    // Keep trying about as long as the server keeps the session after a disconnect (~7.5s)
    reconnectionAttempts: 10,
    reconnectionDelay: 100,
    reconnectionDelayMax: 1000,
    timeout: 2000
  });

  private clientId: string = uuidv4()

  constructor() {
    this.socket.auth = { clientId: this.clientId }
  }

  public onDisconnect$ = fromEvent<void>(this.socket, 'disconnect');
  private onConnect$ = fromEvent<void>(this.socket, 'connect');
  private onConnectError$ = fromEvent<Error>(this.socket, 'connect_error');

  /**
   * Create an observable from a socket.io event.
   * @param event - The name of the event to listen for.
   */
  fromEvent<T>(event: string): Observable<T> {
    return fromEvent<T>(this.socket, event);
  }

  /**
   * Create an observable from a socket.io event with ack.
   * @param event - The name of the event to listen for.s
   */
  fromEventWithAck<T>(event: string): Observable<{ data: T, ack: Function }> {
    return new Observable<{ data: T, ack: Function }>((observer) => {
      const handler = (data: T, ack: Function) => observer.next({ data, ack });
      this.socket.on(event, handler);
      return () => { this.socket.off(event, handler); };
    });
  }

  /**
   * Emit an event to the server.
   * @param event - The name of the event to emit.
   * @param args - Optional arguments to pass to the event handler.
   */
  emit(event: string, ...args: any[]) {
    this.socket.emit(event, ...args);
  }

  /**
   * Emit an event to the server with retry logic. Resolves with the ack value of the server.
   * Emits while disconnected are buffered by socket.io and retried after a timeout, so the server
   * must handle duplicates.
   * @param event
   * @param data
   * @param retries
   * @param timeout
   * @param backoff
   */
  emitWithRetry(event: string, data?: any, {
    retries = 5,
    timeout = 1000,
    backoff = 100  // ms added per retry
  } = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let attempt = 0;

      const tryEmit = () => {
        attempt++;

        this.socket.timeout(timeout).emit(event, data, (err: Error | null, ackValue: unknown) => {
          if (!err) {
            resolve(ackValue);
            return;
          }

          if (attempt > retries) {
            reject(new Error("Max retries reached"));
            return;
          }

          setTimeout(tryEmit, backoff * attempt);
        });
      };

      tryEmit();
    });
  }

   async connect() {
     if (this.socket.connected) { return true; }

     const success$ = this.onConnect$.pipe(
       take(1),
       map(() => true)
     );

     const error$ = this.onConnectError$.pipe(
       take(1),
       map(() => false)
     );

     this.socket.connect();
     return firstValueFrom(race(success$, error$));
  }

  /**
   * Disconnect from the server. Diconnecting a not-connected socket will do nothing.
   */
  disconnect() {
    if (this.socket.connected) {
      this.socket.disconnect();
    }
  }
}
