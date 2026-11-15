import {EffectRef, Injector, effect, inject, untracked} from '@angular/core';
import {StepsState} from '../stepsState';
import {OnlineEmulatorShim} from './emulator.abstract';
import {SupportedEmulators} from '../../../services/emulatorSelection.service';
import {EmulatorService} from '../../../services/emulator.service';
import {EmulatorWindowService} from '../../../services/emulatorWindow.service';
import {ToastService} from '../../../services/toast.service';
import {CancelCommand} from '../../../shared/linkExchange/common';
import {LinkDeviceUtils} from '../../../shared/linkDeviceUtils';
import {StatusEmitterAbstract} from '../../../shared/linkExchange/statusEmitter/statusEmitter.abstract';
import {StatusEmitterEmulator} from '../../../shared/linkExchange/statusEmitter/statusEmitter.emulator';

/** The emulator in the page: its game is the device of the session, like a GBA on a GB-Link. */
export class BrowserEmulatorShim extends OnlineEmulatorShim {

  readonly emulator = SupportedEmulators.browser;

  private emulatorService = inject(EmulatorService);
  private emulatorWindow = inject(EmulatorWindowService);
  private toastService = inject(ToastService);
  private injector = inject(Injector);

  /** Follows the game being loaded and closed. */
  private gameWatch: EffectRef | null = null;

  supportedStates(): StepsState[] {
    return [
      StepsState.ChooseEmulator,
      StepsState.DownloadPlugin,
      StepsState.JoiningSession,
      StepsState.WaitingForPartner,
      StepsState.SettingLinkMode,
      StepsState.Ready,
    ];
  }

  override async prepare(): Promise<boolean> {
    if (await this.emulatorService.prepare()) return true;
    this.toastService.show('The emulator didn\'t load. Check your connection and try again.', 'error', 5000);
    return false;
  }

  /** It needs no script or server: once it loaded, its setup is done. Choosing the game is the step before the session. */
  begin(): void {
    this.markSetupDone();
    this.host.advance(this.emulatorService.game() ? StepsState.JoiningSession : StepsState.DownloadPlugin);
    this.gameWatch ??= effect(() => {
      const hasGame = !!this.emulatorService.game();
      untracked(() => this.gameChanged(hasGame));
    }, {injector: this.injector});
  }

  /**
   * Loading a game moves on to the session, with the game in a window of its own; closing or
   * changing it leaves the session and goes back to choosing one, in the page.
   */
  private gameChanged(hasGame: boolean): void {
    if (hasGame && this.host.isCurrentlyIn(StepsState.DownloadPlugin)) {
      // Browsers only open a window shortly after a click: when this one comes too late, Start opens it
      this.emulatorWindow.open();
      this.host.advance(StepsState.JoiningSession);
    } else if (!hasGame && this.host.hasReached(StepsState.JoiningSession)) {
      this.emulatorWindow.close();
      this.host.advance(StepsState.DownloadPlugin);
      this.host.leaveSession();
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

  sessionDevice(): StatusEmitterAbstract | null {
    const adapter = this.emulatorService.linkAdapter;
    return adapter ? new StatusEmitterEmulator(adapter) : null;
  }

  startLinkMode(): void {
    const adapter = this.emulatorService.linkAdapter;
    if (!adapter || !this.canStartLinkMode()) return;
    // Straight from the click on Start: the window opens even where loading the game was too late for it
    this.emulatorWindow.open();
    const device = new StatusEmitterEmulator(adapter);
    LinkDeviceUtils.tryEnableLinkMode(device)
      .then(() => this.host.advance(StepsState.Ready))
      .catch(error => {
        this.toastService.show(String(error?.message ?? error), 'error', 4000);
        this.disconnect();
      })
      .finally(() => device.destroy());
  }

  /** Ends the link and leaves the session, which goes back to joining one. */
  disconnect(): void {
    this.emulatorService.linkAdapter?.command(new CancelCommand());
    this.host.leaveSession();
  }

  dispose(): void {
    this.gameWatch?.destroy();
    this.gameWatch = null;
    this.emulatorWindow.close();
  }

}
