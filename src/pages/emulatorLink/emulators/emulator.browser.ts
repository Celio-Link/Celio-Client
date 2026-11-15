import {inject} from '@angular/core';
import {Subscription} from 'rxjs';
import {StepsState} from '../stepsState';
import {EmulatorShim} from './emulator.abstract';
import {LinkDeviceService} from '../../../services/linkdevice.service';
import {EmulatorService} from '../../../services/emulator.service';
import {ToastService} from '../../../services/toast.service';
import {CancelCommand} from '../../../shared/linkExchange/common';
import {LinkDeviceUtils} from '../../../shared/linkDeviceUtils';
import {LocalLinkSession} from '../../../shared/linkExchange/localLinkSession';
import {StatusEmitterLinkDevice} from '../../../shared/linkExchange/statusEmitter/statusEmitter.linkDevice';
import {StatusEmitterEmulator} from '../../../shared/linkExchange/statusEmitter/statusEmitter.emulator';

/** The emulator in the page: it links with the GBA on the GB-Link here, without a script or server. */
export class BrowserEmulatorShim extends EmulatorShim {

  private linkDeviceService = inject(LinkDeviceService);
  private emulatorService = inject(EmulatorService);
  private toastService = inject(ToastService);

  private localLink: LocalLinkSession | null = null;
  private localLinkClosed: Subscription | null = null;

  supportedStates(): StepsState[] {
    return [
      StepsState.ConnectingCelioDevice,
      StepsState.ChooseEmulator,
      StepsState.SettingLinkMode,
      StepsState.Ready,
    ];
  }

  override async prepare(): Promise<boolean> {
    if (await this.emulatorService.prepare()) return true;
    this.toastService.show('The emulator didn\'t load. Check your connection and try again.', 'error', 5000);
    return false;
  }

  /** It can start as soon as its game runs. */
  begin(): void {
    this.host.advance(StepsState.SettingLinkMode);
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
    this.endLink();
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
