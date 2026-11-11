import {ChangeDetectorRef, Component, inject, ViewChild} from '@angular/core';
import { NgClass, NgIf } from '@angular/common';

import {CancelCommand, LinkMode} from '../../shared/linkExchange/common';

import {Subscription} from 'rxjs';
import {SocketIOService} from '../../services/socketIO.service';
import {LinkExchangeSession} from '../../shared/linkExchange/linkExchangeSession';
import {LinkDeviceUtils} from '../../shared/linkDeviceUtils';
import {CommandEmitterSocketIO} from '../../shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {LinkDeviceService} from '../../services/linkdevice.service';
import {StatusEmitterAbstract} from '../../shared/linkExchange/statusEmitter/statusEmitter.abstract';
import {StatusEmitterEmulator} from '../../shared/linkExchange/statusEmitter/statusEmitter.emulator';
import {StatusEmitterLinkDevice} from '../../shared/linkExchange/statusEmitter/statusEmitter.linkDevice';
import {CelioPageAbstract} from '../shared/celioPage.abstact';
import {CelioConnectionStatusComponent} from '../../component/panel/connect/connect.component';
import {CelioSessionComponent, SessionState} from '../../component/panel/session/session.compomemt';
import {EmulatorComponent} from '../../component/emulator/emulator.component';
import {EmulatorService} from '../../services/emulator.service';
import {ToastService} from '../../services/toast.service';

enum StepsState {
  ConnectingCelioDevice = 0,
  SelectGame = 1,
  JoiningSession = 2,
  WaitingForPartner = 3,
  SettingLinkMode = 4,
  Ready = 5
}

/** What the GBA is linked through: a GB-Link on USB or the emulator in the page. */
type LinkDevice = 'usb' | 'emulator';

@Component({
  selector: 'app-onlineLink',
  standalone: true,
  imports: [
    NgIf,
    NgClass,
    CelioConnectionStatusComponent,
    CelioSessionComponent,
    EmulatorComponent
  ],
  templateUrl: './awOnlineLink.component.html'
})

export class AwOnlineLinkComponent extends CelioPageAbstract<StepsState>{
  @ViewChild(CelioSessionComponent) sessionPanel!: CelioSessionComponent;

  private linkDeviceService = inject(LinkDeviceService)
  protected emulatorService = inject(EmulatorService)

  protected device: LinkDevice | null = null;

  // Per-route (app.routes.ts): which firmware mode this page drives and the matching ready-screen copy.
  protected awVariant: number | undefined;
  protected readyInstruction: string | undefined;
  protected preStartInstruction: string | undefined;

  protected StepsState = StepsState;

  private disconnectSubscription: Subscription;

  constructor(cd: ChangeDetectorRef, private toastService: ToastService, private socket: SocketIOService) {
    super(cd);
    this.stepState = StepsState.ConnectingCelioDevice;

    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(disconnect => {
      if (this.device !== 'usb') return;
      this.sessionPanel.leaveSession();
      this.device = null;
      this.advanceLinkState(StepsState.ConnectingCelioDevice);
    })
  }

  async ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.device = 'usb';
      this.advanceLinkState(StepsState.SelectGame);
    } else if (this.emulatorService.game()?.series === 'advanceWars') {
      this.device = 'emulator';
      this.advanceLinkState(StepsState.JoiningSession);
    }
  }

  ngAfterViewInit() {
    this.sessionPanel.createSessionEvent.subscribe(() => {
      this.sessionPanel.setLinkSession(new LinkExchangeSession(new CommandEmitterSocketIO(this.socket), this.createStatusEmitter()))
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

  /** The device the session talks to. */
  private createStatusEmitter(): StatusEmitterAbstract {
    if (this.device !== 'emulator') return new StatusEmitterLinkDevice(this.linkDeviceService);
    const adapter = this.emulatorService.linkAdapter;
    // The page only goes on once the emulator has loaded
    if (!adapter) throw new Error('The emulator has not loaded.');
    return new StatusEmitterEmulator(adapter);
  }

  protected usbConnected(): void {
    this.device = 'usb';
    this.advanceLinkState(StepsState.SelectGame);
  }

  /** The emulator in the page is the device: the session can begin while the player chooses the game. */
  protected async useEmulator(): Promise<void> {
    if (!await this.emulatorService.prepare()) {
      this.toastService.show('The emulator didn\'t load. Check your connection and try again.', 'error', 5000);
      return;
    }
    this.device = 'emulator';
    this.advanceLinkState(StepsState.JoiningSession);
  }

  /** Closing the emulator goes back to choosing how to link. */
  protected emulatorClosed(): void {
    this.sessionPanel.leaveSession();
    this.device = null;
    this.advanceLinkState(StepsState.ConnectingCelioDevice);
  }

  /** The emulator needs its game before the link mode can start: the game says which Advance Wars is linked. */
  protected gameMissing(): boolean {
    return this.device === 'emulator' && !this.emulatorService.game()?.advanceWars;
  }

  protected selectAwVariant(variant: number) {
    this.awVariant = variant;
    // A game that opens its link menu before the link mode is on doesn't link until it opens the menu again
    this.preStartInstruction = "Connect your Game Boy Advance with the link cable, then press <b>Start</b> on this page "
      + "before you enter the Link Mode menu in " + (variant === 2 ? "Advance Wars 2" : "Advance Wars") + ".";
    this.readyInstruction = (variant === 2 ? "Advance Wars 2" : "Advance Wars")
      + "<br>Link Mode is now ready! Tip: Advance through setup menus carefully to avoid desyncs. Transferring custom maps can take several minutes.";
    this.advanceLinkState(StepsState.JoiningSession);
  }

  protected resetAwVariant() {
    this.awVariant = undefined;
    this.sessionPanel.leaveSession();
    this.advanceLinkState(StepsState.SelectGame);
  }

  start() {
    if (this.gameMissing()) return;
    const variant = this.device === 'emulator' ? this.emulatorService.game()?.advanceWars?.variant : this.awVariant;
    const device = this.createStatusEmitter();
    LinkDeviceUtils.tryEnableLinkMode(device, LinkMode.advanceWars, variant)
      .then(() => {
        this.advanceLinkState(StepsState.Ready);
      })
      .catch(error => {
        this.toastService.show(String(error?.message ?? error), 'error', 4000)
        console.error(error);
        this.disconnectCelioDevice();
      })
      .finally(() => device.destroy());
  }

  disconnectCelioDevice(): void {
    if (this.device === 'emulator') {
      this.emulatorService.linkAdapter?.command(new CancelCommand());
    } else {
      this.linkDeviceService.sendCommand(new CancelCommand());
    }
    this.sessionPanel.leaveSession()
  }
}
