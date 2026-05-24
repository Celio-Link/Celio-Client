import {ChangeDetectorRef, Directive, HostListener} from '@angular/core';
import {environment} from '../../environments/environment';

@Directive()
export class CelioPageAbstract<StateEnumT> {

  protected stepState: StateEnumT;
  protected readonly usbSupported: boolean =
    typeof navigator !== 'undefined' && navigator.usb !== undefined;
  protected readonly serialSupported: boolean =
    typeof navigator !== 'undefined' && navigator.serial !== undefined;

  protected get webUsbError(): boolean {
    return !this.usbSupported && !this.serialSupported;
  }

  constructor(private cd: ChangeDetectorRef) {
    // @ts-ignore
    this.stepState = 0;
  }

  protected hasReached(step: StateEnumT): boolean {
    return this.stepState >= step;
  }

  protected yetToReach(step: StateEnumT): boolean {
    return this.stepState < step;
  }

  protected isCurrentlyIn(step: StateEnumT): boolean {
    if (this.webUsbError) return false;
    return this.stepState == step
  }

  protected advanceLinkState(step: StateEnumT) {
    this.stepState = step;
    this.cd.detectChanges();
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKeyboardEvent(event: KeyboardEvent) {
    if (environment.production) return;

    if (event.key === 'ArrowUp') {
      // @ts-ignore
      this.stepState++;
    }

    if (event.key === 'ArrowDown') {
      // @ts-ignore
      this.stepState--;
    }
  }
}
