import {inject} from '@angular/core';
import {take} from 'rxjs';
import {StepsState} from '../stepsState';
import {OnlineEmulatorShim} from './emulator.abstract';
import {SupportedEmulators} from '../../../services/emulatorSelection.service';
import {ToastService} from '../../../services/toast.service';
import {SessionState} from '../../../component/panel/session/session.compomemt';
import {LinkDeviceUtils} from '../../../shared/linkDeviceUtils';
import {StatusEmitterAbstract} from '../../../shared/linkExchange/statusEmitter/statusEmitter.abstract';
import {StatusEmitterWebsocket} from '../../../shared/linkExchange/statusEmitter/statusEmitter.websocket';

export class MGBAEmulatorShim extends OnlineEmulatorShim {

  readonly emulator = SupportedEmulators.mGBA;

  private toastService = inject(ToastService);

  private statusEmitterWebsocket: StatusEmitterWebsocket | undefined = undefined;

  private closing = false;
  private timeoutId: ReturnType<typeof setTimeout> | undefined;

  supportedStates(): StepsState[] {
    return [
      StepsState.ChooseEmulator,
      StepsState.DownloadPlugin,
      StepsState.WaitForLocalServer,
      StepsState.JoiningSession,
      StepsState.WaitingForPartner,
      StepsState.SettingLinkMode,
      StepsState.Ready,
    ];
  }

  begin(): void {
    this.host.advance(StepsState.DownloadPlugin);
  }

  resume(): boolean {
    if (!this.emulatorSelection.isSetupComplete()) return false;
    this.waitForServer();
    return true;
  }

  waitForServer(delay: number = 1000): void {
    // The script is loaded: the setup is done
    this.emulatorSelection.setSetupComplete(true)
    this.markSetupDone();
    if (this.host.isCurrentlyIn(StepsState.WaitForLocalServer)) return;

    this.host.advance(StepsState.WaitForLocalServer)
    const websocket = this.statusEmitterWebsocket = new StatusEmitterWebsocket();
    websocket.close$()
      .pipe(take(1))
      .subscribe(() => this.serverClosed());

    this.closing = false;
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      websocket.open().then(() => {
        this.timeoutId = undefined;
        websocket.checkVersion().then((passedCheck) => {
          console.log("Passed version check: " + passedCheck);
          // Disposed while the server answered
          if (this.closing) return;
          if (passedCheck) {
            this.host.advance(StepsState.JoiningSession)
          } else {
            this.emulatorSelection.setSetupComplete(false);
            this.closing = true;
            websocket.destroy();
            this.host.advance(StepsState.DownloadPlugin)
            this.toastService.show("Please download the newest script version.", 'error', 3000)
          }
        })
      })
    }, delay)
  }

  private serverClosed(): void {
    console.log("Cleanup");
    this.host.leaveSession();
    if (!this.closing) this.waitForServer();
  }

  sessionDevice(): StatusEmitterAbstract | null {
    return this.statusEmitterWebsocket ?? null;
  }

  override sessionStateChanged(state: SessionState): void {
    switch (state) {
      case SessionState.Start:
        this.host.advance(StepsState.JoiningSession);
        this.statusEmitterWebsocket?.destroy();
        break;
      case SessionState.Waiting:
        if (this.host.isCurrentlyIn(StepsState.Ready)) {
          this.statusEmitterWebsocket?.destroy();
        } else {
          this.host.advance(StepsState.WaitingForPartner);
        }
        break;
      case SessionState.Commit: this.host.advance(StepsState.SettingLinkMode); break;
    }
  }

  startLinkMode(): void {
    const websocket = this.statusEmitterWebsocket;
    if (!websocket) return;
    LinkDeviceUtils.tryEnableLinkMode(websocket)
      .then(() => {
        this.host.advance(StepsState.Ready);
      })
      .catch(error => {
        this.toastService.show(error, 'error', 4000)
        websocket.destroy();
        console.error(error);
      })
  }

  disconnect(): void {
    this.statusEmitterWebsocket?.destroy();
  }

  dispose(): void {
    this.closing = true;
    clearTimeout(this.timeoutId);
    this.timeoutId = undefined;
    this.statusEmitterWebsocket?.destroy();
    this.statusEmitterWebsocket = undefined;
  }

}
