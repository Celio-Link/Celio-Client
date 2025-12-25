import {ChangeDetectorRef, Component, HostListener, inject} from '@angular/core';
import { NgClass, NgIf } from '@angular/common';

import { CommandType , LinkDeviceService, Mode } from '../../services/linkdevice.service';

import {Subscription} from 'rxjs';
import {PlayerSessionService} from '../../services/playersession.service';
import {WebSocketService} from '../../services/websocket.service';
import {LinkdeviceExchangeSession} from './linkdeviceExchangeSession';

enum StepsState {
  ConnectingCelioDevice = 0,
  JoiningSession = 1,
  WaitingForPartner = 2,
  SettingLinkMode = 3,
  Ready = 4
}

@Component({
  selector: 'app-onlineLink',
  standalone: true,
  imports: [
    NgIf,
    NgClass
  ],
  templateUrl: './onlineLink.component.html'
})
export class OnlineLinkComponent {
  private linkDeviceService = inject(LinkDeviceService)

  protected sessionId: string | undefined = "";

  protected stepState: StepsState = StepsState.ConnectingCelioDevice;
  protected StepsState = StepsState;

  private partnerSubscription: Subscription

  private linkSession: LinkdeviceExchangeSession | undefined = undefined;

  constructor(private cd: ChangeDetectorRef, private playerSessionService: PlayerSessionService, private socket: WebSocketService) {
    this.partnerSubscription = this.playerSessionService.partnerEvents$.subscribe(partnerConnected => {
      if (partnerConnected) {
        this.advanceLinkState(StepsState.SettingLinkMode);
        this.linkSession = new LinkdeviceExchangeSession(this.socket, this.linkDeviceService, () => { this.renewSession() });
      }
      else {
        this.advanceLinkState(StepsState.WaitingForPartner);
      }
    })
  }

  ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.advanceLinkState(StepsState.JoiningSession);
      this.socket.connect();
    }
  }

  ngOnDestroy() {
    this.partnerSubscription.unsubscribe();
  }

  connect(): void {
    this.linkDeviceService.connectDevice()
      .then(isConnected => {
        if (isConnected) {
          this.advanceLinkState(StepsState.JoiningSession);
          this.socket.connect();
        }
      }
    )
  }

  enableLinkMode() {
    let args: Uint8Array = new Uint8Array(1);
    args[0] = Mode.onlineLink;
    this.linkDeviceService.sendCommand(CommandType.SetMode, args);
  }

  createSession() {
    this.playerSessionService.createSession().then(session => {
      this.sessionId = session.id;
      this.advanceLinkState(StepsState.WaitingForPartner);
    });
  }

  joinSession(sessionId: string) {
    this.playerSessionService.joinSession(sessionId).then(session => {
      this.linkSession = new LinkdeviceExchangeSession(this.socket, this.linkDeviceService, () => { this.renewSession() });
      this.advanceLinkState(StepsState.SettingLinkMode);
    });
  }

  renewSession() {
    this.linkSession = new LinkdeviceExchangeSession(this.socket, this.linkDeviceService, () => { this.renewSession() });
  }

  leaveSession() {
    this.playerSessionService.leaveSession();
    this.advanceLinkState(StepsState.JoiningSession);
    this.linkSession = undefined;
  }

  protected hasReached(step: StepsState): boolean {
    return this.stepState >= step;
  }

  protected yetToReach(step: StepsState): boolean {
    return this.stepState < step;
  }

  protected isCurrentlyIn(step: StepsState): boolean {
    return this.stepState == step
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'ArrowUp') {
      this.stepState++;
    }

    if (event.key === 'ArrowDown') {
      this.stepState--;
    }
  }

  private advanceLinkState(step: StepsState) {
    this.stepState = step;
    this.cd.detectChanges();
  }
}
