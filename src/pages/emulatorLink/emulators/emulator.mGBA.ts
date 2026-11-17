import {inject} from '@angular/core';
import {Subscription, take} from 'rxjs';
import {StepsState} from '../stepsState';
import {LocalEmulatorShim} from './emulator.abstract';
import {LinkDeviceService} from '../../../services/linkdevice.service';
import {SupportedEmulators} from '../../../services/emulatorSelection.service';
import {ToastService} from '../../../services/toast.service';
import {CancelCommand, LinkStatus} from '../../../shared/linkExchange/common';
import {LinkDeviceUtils} from '../../../shared/linkDeviceUtils';
import {LinkExchangeSession} from '../../../shared/linkExchange/linkExchangeSession';
import {CommandEmitterWebsocket} from '../../../shared/linkExchange/commandEmitter/commandEmitter.websocket';
import {StatusEmitterLinkDevice} from '../../../shared/linkExchange/statusEmitter/statusEmitter.linkDevice';

/** The desktop mGBA: it links through our script, which runs a local server. */
export class MGBAEmulatorShim extends LocalEmulatorShim {

  readonly emulator = SupportedEmulators.mGBA;

  private linkDeviceService = inject(LinkDeviceService);
  private toastService = inject(ToastService);

  private linkSession: LinkExchangeSession | undefined = undefined;
  /** Stops waiting for the server again once its connection closes. */
  private closing = false;
  private timeoutId: ReturnType<typeof setTimeout> | undefined;

  private statusSubscription: Subscription = this.linkDeviceService.statusEvents$.subscribe(statusEvents => {
    console.log("Status: " + LinkStatus[statusEvents]);
    if (statusEvents === LinkStatus.LinkClosed) {
      if (this.host.isCurrentlyIn(StepsState.WaitForLocalServer)) return;
      this.linkSession?.destroy();
      this.linkSession = undefined;
    }
  });

  supportedStates(): StepsState[] {
    return [
      StepsState.ConnectingCelioDevice,
      StepsState.ChooseEmulator,
      StepsState.DownloadPlugin,
      StepsState.WaitForLocalServer,
      StepsState.SettingLinkMode,
      StepsState.Ready,
    ];
  }

  /** The script has to be loaded into mGBA first. */
  begin(): void {
    this.host.advance(StepsState.DownloadPlugin);
  }

  /** The script was loaded before: wait for its server right away. */
  resume(): boolean {
    if (!this.emulatorSelection.isSetupComplete()) return false;
    this.waitForServer();
    return true;
  }

  waitForServer(delay: number = 1000): void {
    // The script is loaded: the setup is done
    this.emulatorSelection.setSetupComplete(true)
    this.markSetupDone();
    console.log("Start Wait for Server");
    this.host.advance(StepsState.WaitForLocalServer)
    const commandEmitterWebsocket = new CommandEmitterWebsocket();
    this.linkSession?.destroy();
    this.linkSession = new LinkExchangeSession(commandEmitterWebsocket, new StatusEmitterLinkDevice(this.linkDeviceService));
    commandEmitterWebsocket.close$()
      .pipe(take(1))
      .subscribe(() => {
        if (this.linkDeviceService.isConnected()) {
          this.linkDeviceService.sendCommand(new CancelCommand());
          console.log("Starting after Close$ fired");
          if (!this.closing) this.waitForServer();
        }
      });

    this.closing = false;
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      commandEmitterWebsocket.open().then(() => {
        this.timeoutId = undefined;
        commandEmitterWebsocket.checkVersion().then((passedCheck) => {
          console.log("Passed version check: " + passedCheck);
          // Disposed while the server answered
          if (this.closing) return;
          if (passedCheck) {
            this.host.advance(StepsState.SettingLinkMode)
          } else {
            this.emulatorSelection.setSetupComplete(false);
            this.closing = true;
            this.linkSession?.destroy();
            this.host.advance(StepsState.DownloadPlugin)
            this.toastService.show("Please download the newest script version.", 'error', 3000)
          }
        })
      })
    }, delay)
  }

  startLinkMode(): void {
    LinkDeviceUtils.tryEnableLinkMode(new StatusEmitterLinkDevice(this.linkDeviceService))
      .then(() => {
        this.host.advance(StepsState.Ready);
      })
      .catch(error => {
        this.toastService.show(error, 'error', 4000)
        console.error(error);
        this.disconnect();
        this.linkSession?.destroy();
        this.linkSession = undefined;
      })
  }

  /** Ending the link closes the server connection, which goes back to waiting for the server. */
  disconnect(): void {
    this.linkDeviceService.sendCommand(new CancelCommand());
  }

  dispose(): void {
    this.closing = true;
    clearTimeout(this.timeoutId);
    this.timeoutId = undefined;
    this.statusSubscription.unsubscribe();
    this.linkSession?.destroy();
    this.linkSession = undefined;
  }

}
