import {ChangeDetectorRef, Component, inject, ViewChild} from '@angular/core';
import { NgClass, NgIf } from '@angular/common';

import {CommandType, LinkMode} from '../../shared/linkExchange/common';

import {Subscription} from 'rxjs';
import {WebSocketService} from '../../services/websocket.service';
import {LinkExchangeSession} from '../../shared/linkExchange/linkExchangeSession';
import {ToastComponent} from '../../component/toast/toast.component';
import {LinkDeviceUtils} from '../../shared/linkDeviceUtils';
import {CommandEmitterSocketIO} from '../../shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {LinkDeviceService} from '../../services/linkdevice.service';
import {StatusEmitterLinkDevice} from '../../shared/linkExchange/statusEmitter/statusEmitter.linkDevice';
import {CelioPageAbstract} from '../shared/celioPage.abstact';
import {CelioConnectionStatusComponent} from '../../component/panel/connect/connect.component';
import {CelioSessionComponent, SessionState} from '../../component/panel/session/session.compomemt';
import {ToastService} from '../../services/toast.service';

enum StepsState {
  ConnectingCelioDevice = 0,
  SelectGame = 1,
  JoiningSession = 2,
  WaitingForPartner = 3,
  SettingLinkMode = 4,
  Ready = 5
}

@Component({
  selector: 'app-onlineLink',
  standalone: true,
  imports: [
    NgIf,
    NgClass,
    CelioConnectionStatusComponent,
    CelioSessionComponent
  ],
  templateUrl: './awOnlineLink.component.html'
})

export class AwOnlineLinkComponent extends CelioPageAbstract<StepsState>{
  @ViewChild(CelioConnectionStatusComponent) connectionPanel!: CelioConnectionStatusComponent;
  @ViewChild(CelioSessionComponent) sessionPanel!: CelioSessionComponent;

  private linkDeviceService = inject(LinkDeviceService)

  // Per-route (app.routes.ts): which firmware mode this page drives and the matching ready-screen copy.
  protected awVariant: number | undefined;
  protected readyInstruction: string | undefined;
  protected preStartInstruction: string | undefined;

  protected StepsState = StepsState;

  private disconnectSubscription: Subscription;

  // The Advance Wars protocol proxy shipped in firmware 2.2.0; the relay in
  // older builds can't link over the internet, so block AW sessions early
  // instead of failing mid-handshake. Other modes work on older firmware.
  private static readonly awMinFirmware = { major: 2, minor: 2, patch: 0 };

  constructor(cd: ChangeDetectorRef, private toastService: ToastService, private socket: WebSocketService) {
    super(cd);
    this.stepState = StepsState.ConnectingCelioDevice;

    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(disconnect => {
      this.sessionPanel.leaveSession();
      this.advanceLinkState(StepsState.ConnectingCelioDevice);
    })
  }

  async ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.advanceLinkState(StepsState.SelectGame);
    }
  }

  ngAfterViewInit() {
    this.connectionPanel.next.subscribe(() => { this.advanceLinkState(StepsState.JoiningSession);})
    this.sessionPanel.createSessionEvent.subscribe(() => {
      this.sessionPanel.setLinkSession(new LinkExchangeSession(new CommandEmitterSocketIO(this.socket), new StatusEmitterLinkDevice(this.linkDeviceService)))
    })
    this.sessionPanel.sessionStateChange.subscribe(state => {
      switch (state) {
        case SessionState.Start: this.advanceLinkState(StepsState.JoiningSession); break;
        case SessionState.Waiting: this.advanceLinkState(StepsState.WaitingForPartner); break;
        case SessionState.Commit: this.advanceLinkState(StepsState.SettingLinkMode); break;
      }
    })
  }

  ngOnDestroy() {
    this.disconnectSubscription.unsubscribe();
    this.sessionPanel.leaveSession();
  }

  protected async selectAwVariant(variant: number) {
    if (!await this.checkAwFirmware()) return;
    this.awVariant = variant;
    this.preStartInstruction = "Before you press Start, connect your Game Boy Advance with the link cable and bring "
      + (variant === 2 ? "Advance Wars 2" : "Advance Wars") + " to the <b>\"Preparing to link\"</b> screen.";
    this.readyInstruction = (variant === 2 ? "Advance Wars 2" : "Advance Wars")
      + "<br>Link Mode is now ready! Tip: Advance through setup menus carefully to avoid desyncs. Transferring custom maps can take several minutes.";
    this.advanceLinkState(StepsState.JoiningSession);
  }

  protected resetAwVariant() {
    this.awVariant = undefined;
    this.sessionPanel.leaveSession();
    this.advanceLinkState(StepsState.SelectGame);
  }

  private async checkAwFirmware(): Promise<boolean> {
    const min = AwOnlineLinkComponent.awMinFirmware;
    const version = await LinkDeviceUtils.getFirmwareVersion(this.linkDeviceService);
    const ok = version !== undefined && (
      version.major !== min.major ? version.major > min.major :
      version.minor !== min.minor ? version.minor > min.minor :
      version.patch >= min.patch);
    if (ok) return true;

    const have = version ? `v${version.major}.${version.minor}.${version.patch}` : 'an unknown version';
    this.toastService.show(
      `Advance Wars needs firmware v${min.major}.${min.minor}.${min.patch} or newer — this adapter is running ${have}. Update it from the GBLink launcher and reconnect.`,
      'error', 8000);
    await this.linkDeviceService.disconnect();
    return false;
  }

  start() {
    LinkDeviceUtils.tryEnableLinkMode(new StatusEmitterLinkDevice(this.linkDeviceService), LinkMode.advanceWars, this.awVariant)
      .then(() => {
        this.advanceLinkState(StepsState.Ready);
      })
      .catch(error => {
        this.toastService.show(error, 'error', 4000)
        console.error(error);
        this.disconnectCelioDevice();
      })
  }

  disconnectCelioDevice(): void {
    this.linkDeviceService.sendCommand(CommandType.Cancel);
    this.sessionPanel.leaveSession()
  }
}
