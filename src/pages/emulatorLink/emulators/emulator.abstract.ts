import {inject} from '@angular/core';
import {StepsState} from '../stepsState';
import {EmulatorSelectionService, SupportedEmulators} from '../../../services/emulatorSelection.service';

export interface LocalEmulatorShimHost {
  advance(state: StepsState): void;
  hasReached(state: StepsState): boolean;
  isCurrentlyIn(state: StepsState): boolean;
}

export abstract class LocalEmulatorShim {

  protected emulatorSelection = inject(EmulatorSelectionService);

  constructor(protected host: LocalEmulatorShimHost) {}

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

  canStartLinkMode(): boolean {
    return true;
  }

  abstract startLinkMode(): void;

  abstract disconnect(): void;

  abstract dispose(): void;

}
