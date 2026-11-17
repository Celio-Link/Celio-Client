import {EffectRef, Injector, effect, inject, untracked} from '@angular/core';
import {Subscription} from 'rxjs';
import {StepsState} from '../stepsState';
import {LocalEmulatorShim} from './emulator.abstract';
import {SupportedEmulators} from '../../../services/emulatorSelection.service';
import {LinkDeviceService} from '../../../services/linkdevice.service';
import {EmulatorService} from '../../../services/emulator.service';
import {EmulatorWindowService} from '../../../services/emulatorWindow.service';
import {ToastService} from '../../../services/toast.service';
import {CancelCommand} from '../../../shared/linkExchange/common';
import {LinkDeviceUtils} from '../../../shared/linkDeviceUtils';
import {LocalLinkSession} from '../../../shared/linkExchange/localLinkSession';
import {StatusEmitterLinkDevice} from '../../../shared/linkExchange/statusEmitter/statusEmitter.linkDevice';
import {StatusEmitterEmulator} from '../../../shared/linkExchange/statusEmitter/statusEmitter.emulator';

/** The emulator in the page: it links with the GBA on the GB-Link here, without a script or server. */
export class BrowserEmulatorShim extends LocalEmulatorShim {

  readonly emulator = SupportedEmulators.browser;

  private linkDeviceService = inject(LinkDeviceService);
  private emulatorService = inject(EmulatorService);
  private emulatorWindow = inject(EmulatorWindowService);
  private toastService = inject(ToastService);
  private injector = inject(Injector);

  /** Follows the game being loaded and closed. */
  private gameWatch: EffectRef | null = null;

  private localLink: LocalLinkSession | null = null;
  private localLinkClosed: Subscription | null = null;

  supportedStates(): StepsState[] {
    return [
      StepsState.ConnectingCelioDevice,
      StepsState.ChooseEmulator,
      StepsState.DownloadPlugin,
      StepsState.SettingLinkMode,
      StepsState.Ready,
    ];
  }

  override async prepare(): Promise<boolean> {
    if (await this.emulatorService.prepare()) return true;
    this.toastService.show('The emulator didn\'t load. Check your connection and try again.', 'error', 5000);
    return false;
  }

  /** It needs no script or server: once it loaded, its setup is done. Choosing the game is the step before Start. */
  begin(): void {
    this.markSetupDone();
    this.host.advance(this.emulatorService.game() ? StepsState.SettingLinkMode : StepsState.DownloadPlugin);
    this.gameWatch ??= effect(() => {
      const hasGame = !!this.emulatorService.game();
      untracked(() => this.gameChanged(hasGame));
    }, {injector: this.injector});
  }

  /**
   * Loading a game moves on to Start, with the game in a window of its own; closing or changing
   * it goes back to choosing one, in the page.
   */
  private gameChanged(hasGame: boolean): void {
    if (hasGame && this.host.isCurrentlyIn(StepsState.DownloadPlugin)) {
      // Browsers only open a window shortly after a click: when this one comes too late, Start opens it
      this.emulatorWindow.open();
      this.host.advance(StepsState.SettingLinkMode);
    } else if (!hasGame && this.host.hasReached(StepsState.SettingLinkMode)) {
      this.endLink();
      this.emulatorWindow.close();
      this.host.advance(StepsState.DownloadPlugin);
    }
  }

  resume(): boolean {
    if (!this.emulatorService.game()) return false;
    this.begin();
    return true;
  }

  /** The emulator needs its game before the link mode can start. */
  override canStartLinkMode(): boolean {
    return !!this.emulatorService.game();
  }

  startLinkMode(): void {
    const adapter = this.emulatorService.linkAdapter;
    if (!adapter || !this.canStartLinkMode() || this.localLink) return;
    // Straight from the click on Start: the window opens even where loading the game was too late for it
    this.emulatorWindow.open();
    // The GBA on the GB-Link is seat 0 and leads: a throttled page then slows only its own game, never the GBA's link
    const devices = [new StatusEmitterLinkDevice(this.linkDeviceService), new StatusEmitterEmulator(adapter)];
    const localLink = this.localLink = new LocalLinkSession(devices);
    // Both games left the room: the next visit starts with Start again
    this.localLinkClosed = localLink.closed$.subscribe(() => this.disconnect());
    Promise.all(devices.map(device => LinkDeviceUtils.tryEnableLinkMode(device)))
      .then(() => {
        if (this.localLink === localLink) this.host.advance(StepsState.Ready);
      })
      .catch(error => {
        this.toastService.show(String(error?.message ?? error), 'error', 4000);
        this.disconnect();
      });
  }

  /** Ends the link and goes back to starting it. */
  disconnect(): void {
    if (this.endLink() && this.host.hasReached(StepsState.SettingLinkMode)) {
      this.host.advance(StepsState.SettingLinkMode);
    }
  }

  dispose(): void {
    this.gameWatch?.destroy();
    this.gameWatch = null;
    this.endLink();
    this.emulatorWindow.close();
  }

  /** Ends the link between the GBA and the game in the page. False when there was none. */
  private endLink(): boolean {
    if (!this.localLink) return false;
    this.localLinkClosed?.unsubscribe();
    this.localLinkClosed = null;
    this.localLink.destroy();
    this.localLink = null;
    this.linkDeviceService.sendCommand(new CancelCommand());
    this.emulatorService.linkAdapter?.command(new CancelCommand());
    return true;
  }

}
