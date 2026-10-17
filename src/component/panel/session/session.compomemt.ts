import {Component, EventEmitter, Input, Output, Pipe} from '@angular/core';
import {NgIf} from '@angular/common';
import {PlayerSessionService} from '../../../services/playersession.service';
import {WebSocketService} from '../../../services/websocket.service';
import {Subscription} from 'rxjs';
import {LinkExchangeSession} from '../../../shared/linkExchange/linkExchangeSession';
import {ToastService} from '../../../services/toast.service';
import {CurrentPipe, ReachedPipe} from '../../../shared/stepStateHelper';

export enum SessionState {
  Start = 0,
  Waiting = 1,
  Commit = 2
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
  protected joinSessionId: string = "";
  protected playerNumber: number = 2;
  protected state: SessionState = SessionState.Start;

  @Input() active = false;
  @Output() sessionStateChange = new EventEmitter<SessionState>();
  @Output() createSessionEvent = new EventEmitter<void>();

  constructor(private playerSessionService: PlayerSessionService, private socket: WebSocketService, private toastService: ToastService) {

    this.partnerSubscription = this.playerSessionService.partnerEvents$.subscribe(partnersReady => {
      if (partnersReady) {
        this.updateSessionState(SessionState.Commit);
      }
      else {
        this.toastService.show("A player has disconnected");
        this.updateSessionState(SessionState.Waiting);
      }
    });

    this.linkSessionCloseSubscription = this.playerSessionService.sessionClose$.subscribe(() => {
      this.toastService.show("Session has ended", "info");
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
    if (state === SessionState.Start) {
      this.joinSessionId = "";
    }
    this.sessionStateChange.emit(state);
  }

  onJoinSessionIdInput(event: Event) {
    this.joinSessionId = (event.target as HTMLInputElement).value;
  }

  onPlayerNumberInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const playerNumber: number = input.valueAsNumber;
    if (isNaN(playerNumber) || playerNumber <= 1 || playerNumber >= 5) {
      input.value = "";
      this.playerNumber = 2;
      return;
    }
    this.playerNumber = playerNumber;
  }

  joinSession() {
    const id = this.joinSessionId.trim();
    if (!id) return;
    this.enterSession(id);
  }

  createSession() {
    this.startSession(() => this.playerSessionService.createSession(this.playerNumber));
  }

  enterSession(userSessionId: string) {
    this.startSession(() => this.playerSessionService.enterSession(userSessionId));
  }

  private async startSession(sessionRequest: () => Promise<{ id: string }>) {
    if (!await this.socket.connect()) {
      this.toastService.show("Could not connect to Server", 'error', 4000)
      console.error("Could not connect to Server");
      return;
    }
    sessionRequest().then(session => {
      this.createSessionEvent.emit();
      this.updateSessionState(SessionState.Waiting);
      this.sessionId = session.id;
    }).catch(error => {
      this.toastService.show(error, 'error', 4000)
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
    this.toastService.show("Session Id copied", 'info', 1800)
  }

  protected readonly SessionState = SessionState;
}
