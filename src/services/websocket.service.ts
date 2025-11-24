import {Injectable} from '@angular/core';
import {io, Socket} from 'socket.io-client';
import {fromEvent, Observable} from 'rxjs';

@Injectable({  providedIn: 'root',})
export class WebSocketService {

  private socket: Socket = io('ws://localhost:8080', {
    transports: ["websocket"],
    autoConnect: false,
    retries: 10,
    ackTimeout: 400,
    reconnectionAttempts: 4,
    reconnectionDelay: 100,
    reconnectionDelayMax: 1000,
    timeout: 5000,
  });

  uuid() {
    return 5;
  }

  onDisconnect$ = fromEvent<void>(this.socket, 'disconnect');
  onConnect = fromEvent<void>(this.socket, 'connect');

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
      this.socket.on(event, (data: T, ack: Function) => {
        observer.next({ data, ack });
      });
    });
  }

  /**
   * Emit an event to the server.
   * @param event - The name of the event to emit.
   * @param args - Optional arguments to pass to the event handler.
   */
  emit(event: string, ...args: any[]) {
    this.socket.emit(event, args);
  }

  /**
   * Emit an event to the server with retry logic.
   * @param event
   * @param data
   * @param retries
   * @param timeout
   * @param backoff
   */
  emitWithRetry<R>(event: string, data: any, {
    retries = 5,
    timeout = 2000,
    backoff = 500  // ms added per retry
  } = {}) {

    const id = this.uuid();

    return new Promise((resolve, reject) => {
      let attempt = 0;

      const tryEmit = () => {
        attempt++;

        this.socket.timeout(timeout).emit(event, { id, data }, (err: any, response: R) => {
          if (!err) {
            resolve(response);
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

  connect() {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  disconnect() {
    if (this.socket.connected) {
      this.socket.disconnect();
    }
  }
}
