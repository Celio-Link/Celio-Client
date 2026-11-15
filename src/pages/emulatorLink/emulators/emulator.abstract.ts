import {inject} from '@angular/core';
import {StepsState} from '../stepsState';
import {EmulatorSelectionService, SupportedEmulators} from '../../../services/emulatorSelection.service';

/** What a shim may do with the page's steps. */
export interface EmulatorShimHost {
  advance(state: StepsState): void;
  hasReached(state: StepsState): boolean;
  isCurrentlyIn(state: StepsState): boolean;
}

/**
 * The steps of one emulator, from the moment it is chosen until its link is ready.
 * The page owns connecting the GB-Link and choosing the emulator; the shim owns everything after.
 * Shims are created in an injection context, so they can inject the services they need.
 */
export abstract class EmulatorShim {

  protected emulatorSelection = inject(EmulatorSelectionService);

  constructor(protected host: EmulatorShimHost) {}

  /** The emulator these steps are for. */
  abstract readonly emulator: SupportedEmulators;

  /** The setup is done from this emulator's view: remember it, so the other pages know it was chosen. */
  protected markSetupDone(): void {
    this.emulatorSelection.setSelectedEmulator(this.emulator);
  }

  /** The steps this emulator goes through, shown in the step bar. */
  abstract supportedStates(): StepsState[];

  /** Gets the emulator ready once it is chosen. Resolves false when it can't run. */
  prepare(): Promise<boolean> {
    return Promise.resolve(true);
  }

  /** Moves to this emulator's first step after it was chosen. */
  abstract begin(): void;

  /** Continues a setup from an earlier visit. False when there is nothing to continue. */
  abstract resume(): boolean;

  /** Link mode can be started now. */
  canStartLinkMode(): boolean {
    return true;
  }

  abstract startLinkMode(): void;

  abstract disconnect(): void;

  /** Ends everything the shim started, without changing the steps. */
  abstract dispose(): void;

}
