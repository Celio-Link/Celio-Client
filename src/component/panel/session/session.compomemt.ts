import {Component, EventEmitter, Input, Output, Pipe} from '@angular/core';
import {NgIf} from '@angular/common';
import {PlayerSessionService} from '../../../services/playersession.service';
import {WebSocketService} from '../../../services/websocket.service';
import {Subscription} from 'rxjs';
import {LinkExchangeSession} from '../../../shared/linkExchange/linkExchangeSession';


export enum SessionState {
  Start = 0,
  Waiting = 1,
  Commit = 2
}

@Pipe({
  name: 'hasReachedState',
  standalone: true,
})
export class ReachedPipe {
  transform<T>(
    current: T,
    step: T
  ): boolean {
    return current >= step;
  }
}

@Pipe({
  name: 'isCurrentlyInState',
  standalone: true,
})
export class CurrentPipe {
  transform<T>(
    current: T,
    step: T
  ): boolean {
    return current == step;
  }
}

@Component({
  selector: 'celio-session-panel',
  imports: [
    NgIf,
    ReachedPipe,
    CurrentPipe
  ],
  templateUrl: './session.component.html'
})
export class CelioSessionComponent {


  private partnerSubscription: Subscription;
  private linkSession: LinkExchangeSession | undefined = undefined;
  private linkSessionCloseSubscription: Subscription

  protected sessionId: string | undefined = "";
  protected state: SessionState = SessionState.Start;

  @Input() active = false;
  @Output() sessionStateChange = new EventEmitter<SessionState>();
  @Output() createSessionEvent = new EventEmitter<void>();

  constructor(private playerSessionService: PlayerSessionService, private socket: WebSocketService) {

    this.partnerSubscription = this.playerSessionService.partnerEvents$.subscribe(partnerConnected => {
      if (partnerConnected) {
        this.updateSessionState(SessionState.Commit);
      }
      else {
        //this.toast.show("Partner has disconnected");
        this.updateSessionState(SessionState.Waiting);
      }
    });

    this.linkSessionCloseSubscription = this.playerSessionService.sessionClose$.subscribe(() => {
      //this.toast.show("Session has ended");
      this.socket.disconnect();
      this.linkSession?.destroy();
      this.updateSessionState(SessionState.Start);
    });
  }

  ngOnDestroy() {
    this.linkSessionCloseSubscription.unsubscribe();
    this.partnerSubscription.unsubscribe();
  }

  setLinkSession(linkSession: LinkExchangeSession) {
    this.linkSession?.destroy();
    this.linkSession = linkSession;
  }

  private updateSessionState(state: SessionState) {
    if (this.state == state) return;
    this.state = state;
    this.updateSessionState(state);
  }

  async enterSession(userSessionId?: string) {
    if (!await this.socket.connect()) {
      //this.toast.show("Could not connect to Server", 'error', 4000)
      console.error("Could not connect to Server");
    }
    this.playerSessionService.enterSession(userSessionId).then(session => {
      this.createSessionEvent.emit();
      if (userSessionId) {
        this.updateSessionState(SessionState.Commit);
      } else {
        this.updateSessionState(SessionState.Waiting);
      }
      this.sessionId = session.id;
    }).catch(error => {
      //this.toast.show(error, 'error', 4000)
      console.error(error);
      this.socket.disconnect();
      this.updateSessionState(SessionState.Start);
    })
  }

  leaveSession() {
    this.playerSessionService.leaveSession();
    this.socket.disconnect();
    this.linkSession?.destroy();
    this.updateSessionState(SessionState.Start);
  }

  copySessionId() {
    navigator.clipboard.writeText(this.sessionId!);
    //this.toast.show("Session Id copied", 'info', 1800)
  }

  protected readonly SessionState = SessionState;
}
