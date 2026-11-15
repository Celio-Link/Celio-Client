import {inject} from '@angular/core';
import {StepsState} from '../stepsState';
import {EmulatorSelectionService, SupportedEmulators} from '../../../services/emulatorSelection.service';
import {SessionState} from '../../../component/panel/session/session.compomemt';
import {StatusEmitterAbstract} from '../../../shared/linkExchange/statusEmitter/statusEmitter.abstract';

export interface OnlineEmulatorShimHost {
  advance(state: StepsState): void;
  hasReached(state: StepsState): boolean;
  isCurrentlyIn(state: StepsState): boolean;
  leaveSession(): void;
}

export abstract class OnlineEmulatorShim {

  protected emulatorSelection = inject(EmulatorSelectionService);

  constructor(protected host: OnlineEmulatorShimHost) {}

  abstract readonly emulator: SupportedEmulators;

  protected markSetupDone(): void {
    this.emulatorSelection.setSelectedEmulator(this.emulator);
  }

  abstract supportedStates(): StepsState[];

  prepare(): Promise<boolean> {
    return Promise.resolve(true);
  }

  abstract begin(): void;

  abstract resume(): boolean;

  abstract sessionDevice(): StatusEmitterAbstract | null;

  sessionStateChanged(state: SessionState): void {
    switch (state) {
      case SessionState.Start:
        if (this.host.hasReached(StepsState.JoiningSession)) this.host.advance(StepsState.JoiningSession);
        break;
      case SessionState.Waiting: this.host.advance(StepsState.WaitingForPartner); break;
      case SessionState.Commit: this.host.advance(StepsState.SettingLinkMode); break;
    }
  }

  canStartLinkMode(): boolean {
    return true;
  }

  abstract startLinkMode(): void;

  abstract disconnect(): void;

  abstract dispose(): void;

}
