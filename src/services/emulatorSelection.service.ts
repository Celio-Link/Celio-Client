import {Injectable} from '@angular/core';

export enum SupportedEmulators {
  none = 0,
  mGBA = 1,
}

@Injectable({  providedIn: 'root',})
export class EmulatorSelectionService {

  private emulatorSetupComplete: boolean = false
  private selectedEmulator: SupportedEmulators = SupportedEmulators.none

  constructor() { }

  isSetupComplete(): boolean {
    return this.emulatorSetupComplete;
  }

  setSetupComplete(complete: boolean) {
    this.emulatorSetupComplete = complete;
  }

  getSelectedEmulator(): SupportedEmulators {
    return this.selectedEmulator;
  }

  setSelectedEmulator(emulator: SupportedEmulators) {
    this.selectedEmulator = emulator;
  }

}
