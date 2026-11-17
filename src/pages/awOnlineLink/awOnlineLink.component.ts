import {ChangeDetectorRef, Component, effect, inject, untracked, ViewChild} from '@angular/core';
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
import {EmulatorWindowService} from '../../services/emulatorWindow.service';
import {ToastService} from '../../services/toast.service';
import {GameVariant} from '../../emulator/link/awProtocol';

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
  protected emulatorWindow = inject(EmulatorWindowService)

  protected device: LinkDevice | null = null;

  // Per-route (app.routes.ts): which firmware mode this page drives and the matching ready-screen copy.
  protected awVariant: number | undefined;
  // The Advance Wars the emulator's game links as, chosen by the player when neither its dump nor its header says
  private chosenVariant: { crc32: string; variant: GameVariant } | undefined;
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

    effect(() => {
      const hasGame = !!this.emulatorService.game()?.advanceWars;
      untracked(() => this.gameChanged(hasGame));
    });
  }

  // The emulator is never picked up from an earlier visit: playing in the browser is always chosen anew
  ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.device = 'usb';
      this.advanceLinkState(StepsState.SelectGame);
    }
  }

  ngAfterViewInit() {
    this.sessionPanel.createSessionEvent.subscribe(() => {
      this.sessionPanel.setLinkSession(new LinkExchangeSession(new CommandEmitterSocketIO(this.socket), this.createStatusEmitter()))
    })
    this.sessionPanel.sessionStateChange.subscribe(state => {
      switch (state) {
        case SessionState.Start:
          // Leaving the session to choose another game stays at choosing it
          if (this.hasReached(StepsState.JoiningSession)) this.advanceLinkState(StepsState.JoiningSession);
          break;
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

  /** The emulator in the page is the device: choosing its game is the step before the session. */
  protected async useEmulator(): Promise<void> {
    if (!await this.emulatorService.prepare()) {
      this.toastService.show('The emulator didn\'t load. Check your connection and try again.', 'error', 5000);
      return;
    }
    // A game still loaded from earlier isn't used: the game is always chosen anew
    this.emulatorService.close();
    this.device = 'emulator';
    this.advanceLinkState(StepsState.SelectGame);
  }

  /**
   * Loading a game moves on to the session, with the game in a window of its own; closing or
   * changing it leaves the session and goes back to choosing one, in the page.
   */
  private gameChanged(hasGame: boolean): void {
    if (this.device !== 'emulator') return;
    if (hasGame && this.isCurrentlyIn(StepsState.SelectGame)) {
      // Browsers only open a window shortly after a click: when this one comes too late, Start opens it
      this.emulatorWindow.open();
      this.advanceLinkState(StepsState.JoiningSession);
    } else if (!hasGame && this.hasReached(StepsState.JoiningSession)) {
      this.emulatorWindow.close();
      this.advanceLinkState(StepsState.SelectGame);
      this.sessionPanel.leaveSession();
    }
  }

  /** Closing the emulator goes back to choosing how to link. */
  protected emulatorClosed(): void {
    this.sessionPanel.leaveSession();
    this.device = null;
    this.advanceLinkState(StepsState.ConnectingCelioDevice);
  }

  /** The emulator needs its game before the link mode can start. */
  protected gameMissing(): boolean {
    return this.device === 'emulator' && !this.emulatorService.game();
  }

  /** The emulator's game doesn't say which Advance Wars it is, so the player chooses. */
  protected variantUnknown(): boolean {
    const game = this.emulatorService.game();
    return this.device === 'emulator' && !!game && game.awVariant === undefined;
  }

  /** The emulator's game is loaded, but which Advance Wars it links as isn't chosen yet. */
  protected variantMissing(): boolean {
    return this.device === 'emulator' && !this.gameMissing() && this.emulatorVariant() === undefined;
  }

  /** The variant of the Advance Wars mode the emulator's game links with, once it is known. */
  protected emulatorVariant(): GameVariant | undefined {
    const game = this.emulatorService.game();
    if (!game) return undefined;
    if (game.awVariant !== undefined) return game.awVariant;
    return this.chosenVariant?.crc32 === game.crc32 ? this.chosenVariant.variant : undefined;
  }

  protected chooseEmulatorVariant(variant: GameVariant) {
    const game = this.emulatorService.game();
    if (game) this.chosenVariant = { crc32: game.crc32, variant };
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
    const variant = this.device === 'emulator' ? this.emulatorVariant() : this.awVariant;
    if (this.device === 'emulator' && variant === undefined) return;
    // Straight from the click on Start: the window opens even where loading the game was too late for it
    if (this.device === 'emulator') this.emulatorWindow.open();
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
