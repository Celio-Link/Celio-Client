import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import {firstValueFrom, fromEvent, map, mapTo, Observable, race, take} from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { environment } from '../environments/environment';

@Injectable({  providedIn: 'root',})
export class WebSocketService {

  protected socket: Socket = io(environment.apiUrl, {
    transports: ["websocket"],
    autoConnect: false,
    reconnectionAttempts: 4,
    reconnectionDelay: 100,
    reconnectionDelayMax: 1000,
    timeout: 5000
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
    this.socket.emit(event, ...args);
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
