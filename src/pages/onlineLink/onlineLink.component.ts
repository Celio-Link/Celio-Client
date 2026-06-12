import {ChangeDetectorRef, Component, inject, ViewChild} from '@angular/core';
import { NgClass, NgIf } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import {CommandType, Mode} from '../../shared/linkExchange/common';

import {Subscription, take} from 'rxjs';
import {PlayerSessionService} from '../../services/playersession.service';
import {WebSocketService} from '../../services/websocket.service';
import {LinkExchangeSession} from '../../shared/linkExchange/linkExchangeSession';
import {ToastComponent} from '../../component/toast.component';
import {LinkDeviceUtils} from '../../shared/linkDeviceUtils';
import {CommandEmitterSocketIO} from '../../shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {LinkDeviceService} from '../../services/linkdevice.service';
import {StatusEmitterLinkDevice} from '../../shared/linkExchange/statusEmitter/statusEmitter.linkDevice';
import {CelioPageAbstract} from '../shared/celioPage.abstact';

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
    NgClass,
    ToastComponent
  ],
  templateUrl: './onlineLink.component.html'
})

export class OnlineLinkComponent extends CelioPageAbstract<StepsState>{

  @ViewChild(ToastComponent) toast!: ToastComponent;

  private linkDeviceService = inject(LinkDeviceService)
  private route = inject(ActivatedRoute)

  // Per-route (app.routes.ts): which firmware mode this page drives and the matching ready-screen copy.
  protected linkMode: Mode = this.route.snapshot.data['linkMode'] ?? Mode.onlineLink;
  protected awVariant: number | undefined = this.route.snapshot.data['awVariant'];
  protected readyInstruction: string = this.route.snapshot.data['readyInstruction'] ?? '';

  protected sessionId: string | undefined = "";

  protected StepsState = StepsState;

  private partnerSubscription: Subscription
  private linkSessionCloseSubscription: Subscription
  private disconnectSubscription: Subscription;

  private linkSession: LinkExchangeSession | undefined = undefined;

  constructor(cd: ChangeDetectorRef, private playerSessionService: PlayerSessionService, private socket: WebSocketService) {
    super(cd);
    this.stepState = StepsState.ConnectingCelioDevice;

    this.partnerSubscription = this.playerSessionService.partnerEvents$.subscribe(partnerConnected => {
      if (partnerConnected) {
        this.advanceLinkState(StepsState.SettingLinkMode);
      }
      else {
        this.toast.show("Partner has disconnected");
        this.advanceLinkState(StepsState.WaitingForPartner);
      }
    });

    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(disconnect => {
      this.playerSessionService.leaveSession();
      this.socket.disconnect();
      this.linkSession?.destroy();
      this.advanceLinkState(StepsState.ConnectingCelioDevice);
    })

    this.linkSessionCloseSubscription = this.playerSessionService.sessionClose$.subscribe(() => {
      this.toast.show("Session has ended");
      this.socket.disconnect();
      this.linkSession?.destroy();
      this.advanceLinkState(StepsState.JoiningSession);
    });
  }

  ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.advanceLinkState(StepsState.JoiningSession);
    }
  }

  ngOnDestroy() {
    this.partnerSubscription.unsubscribe();
    this.linkSessionCloseSubscription.unsubscribe();
    this.disconnectSubscription.unsubscribe();
    this.socket.disconnect();
    this.linkSession?.destroy();
  }

  connect(kind: 'usb' | 'serial' = 'usb'): void {
    if (kind === 'usb' ? !this.usbSupported : !this.serialSupported) return;

    this.linkDeviceService.connectDevice(kind)
      .then(isConnected => {
        if (isConnected) {
          this.advanceLinkState(StepsState.JoiningSession);
        }
      }
    )
  }

  start() {
    LinkDeviceUtils.tryEnableLinkMode(new StatusEmitterLinkDevice(this.linkDeviceService), this.linkMode, this.awVariant)
      .then(() => {
        this.advanceLinkState(StepsState.Ready);
      })
      .catch(error => {
        this.toast.show(error, 'error', 4000)
        console.error(error);
        this.disconnectCelioDevice();
      })
  }

  disconnectCelioDevice(): void {
    this.linkDeviceService.sendCommand(CommandType.Cancel);
    this.leaveSession();
  }

  async enterSession(userSessionId?: string) {
    if (!await this.socket.connect()) {
      this.toast.show("Could not connect to Server", 'error', 4000)
      console.error("Could not connect to Server");
    }
    this.playerSessionService.enterSession(userSessionId).then(session => {
      this.createLinkSession();
      if (userSessionId) {
        this.advanceLinkState(StepsState.SettingLinkMode);
      } else {
        this.advanceLinkState(StepsState.WaitingForPartner);
      }
      this.sessionId = session.id;
    }).catch(error => {
      this.toast.show(error, 'error', 4000)
      console.error(error);
      this.socket.disconnect();
      this.advanceLinkState(StepsState.JoiningSession);
    })
  }

  leaveSession() {
    this.playerSessionService.leaveSession();
    this.socket.disconnect();
    this.linkSession?.destroy();
    this.advanceLinkState(StepsState.JoiningSession);
  }

  createLinkSession() {
    this.linkSession?.destroy();
    this.linkSession = new LinkExchangeSession(new CommandEmitterSocketIO(this.socket), new StatusEmitterLinkDevice(this.linkDeviceService));
  }
}
