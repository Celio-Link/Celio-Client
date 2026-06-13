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

  protected get isAwMode(): boolean {
    return this.linkMode === Mode.advanceWars;
  }

  // Advance Wars covers two games with different link protocols; the page
  // blocks until the user picks one so the right variant reaches the firmware.
  protected get awVariantNeeded(): boolean {
    return this.isAwMode && this.awVariant === undefined;
  }

  protected selectAwVariant(variant: number) {
    this.awVariant = variant;
    this.readyInstruction = "Link Mode is now ready! Connect the Link Cable to both Game Boy Advances <br> and start a VS battle from the "
      + (variant === 2 ? "Advance Wars 2" : "Advance Wars") + " menu.";
  }

  protected resetAwVariant() {
    this.awVariant = undefined;
  }

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

  async ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      if (!await this.checkAwFirmware()) return;
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
      .then(async isConnected => {
        if (isConnected) {
          if (!await this.checkAwFirmware()) return;
          this.advanceLinkState(StepsState.JoiningSession);
        }
      }
    )
  }

  // The Advance Wars protocol proxy shipped in firmware 2.2.0; the relay in
  // older builds can't link over the internet, so block AW sessions early
  // instead of failing mid-handshake. Other modes work on older firmware.
  private static readonly awMinFirmware = { major: 2, minor: 2, patch: 0 };

  private async checkAwFirmware(): Promise<boolean> {
    if (!this.isAwMode) return true;

    const min = OnlineLinkComponent.awMinFirmware;
    const version = await this.linkDeviceService.getFirmwareVersion();
    const ok = version !== undefined && (
      version.major !== min.major ? version.major > min.major :
      version.minor !== min.minor ? version.minor > min.minor :
      version.patch >= min.patch);
    if (ok) return true;

    const have = version ? `v${version.major}.${version.minor}.${version.patch}` : 'an unknown version';
    this.toast?.show(
      `Advance Wars needs firmware v${min.major}.${min.minor}.${min.patch} or newer — this adapter is running ${have}. Update it from the GBLink launcher and reconnect.`,
      'error', 8000);
    await this.linkDeviceService.disconnect();
    return false;
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
