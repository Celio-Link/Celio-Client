import {Component, inject, ChangeDetectorRef, ViewChild, EnvironmentInjector, runInInjectionContext} from '@angular/core';
import {NgClass, NgIf} from '@angular/common';
import {LinkDeviceService} from '../../services/linkdevice.service';
import {Subscription} from 'rxjs';
import {CelioPageAbstract} from '../shared/celioPage.abstact';
import {EmulatorSelectionService, SupportedEmulators} from '../../services/emulatorSelection.service';
import {CelioConnectionStatusComponent} from '../../component/panel/connect/connect.component';
import {EmulatorComponent} from '../../component/emulator/emulator.component';
import {EmulatorWindowService} from '../../services/emulatorWindow.service';
import {StepsState} from './stepsState';
import {LocalEmulatorShim, LocalEmulatorShimHost} from './emulators/emulator.abstract';
import {BrowserEmulatorShim} from './emulators/emulator.browser';
import {MGBAEmulatorShim} from './emulators/emulator.mGBA';

@Component({
  selector: 'app-tradeEmu',
  standalone: true,
  imports: [
    NgIf,
    NgClass,
    CelioConnectionStatusComponent,
    EmulatorComponent
  ],
  templateUrl: './emulatorLink.component.html'
})
export class EmulatorLinkComponent extends CelioPageAbstract<StepsState>{

  @ViewChild(CelioConnectionStatusComponent) connectionPanel!: CelioConnectionStatusComponent;

  private linkDeviceService = inject(LinkDeviceService)
  private emulatorSelection = inject(EmulatorSelectionService)
  private injector = inject(EnvironmentInjector)
  protected emulatorWindow = inject(EmulatorWindowService)

  protected StepsState = StepsState;
  protected readonly SupportedEmulators = SupportedEmulators;

  private shim: LocalEmulatorShim | null = null;

  private disconnectSubscription: Subscription;

  constructor(cd: ChangeDetectorRef) {
    super(cd);
    this.stepState = StepsState.ConnectingCelioDevice;

    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(() => {
      this.setShim(null);
      this.advanceLinkState(StepsState.ConnectingCelioDevice);
    })
  }

  ngOnInit() {
    if (!this.linkDeviceService.isConnected()) return;
    const shim = this.createShim(this.emulatorSelection.getSelectedEmulator());
    this.setShim(shim);
    if (!shim?.resume()) {
      this.setShim(null);
      this.advanceLinkState(StepsState.ChooseEmulator);
    }
  }

  ngAfterViewInit() {
    this.connectionPanel.next.subscribe(() => { this.advanceLinkState(StepsState.ChooseEmulator);})
  }

  ngOnDestroy() {
    this.disconnectSubscription.unsubscribe();
    this.setShim(null);
  }

  protected get browser(): boolean {
    return this.shim instanceof BrowserEmulatorShim;
  }

  protected get mgba(): MGBAEmulatorShim | null {
    return this.shim instanceof MGBAEmulatorShim ? this.shim : null;
  }

  protected showsStep(state: StepsState): boolean {
    return !this.shim || this.shim.supportedStates().includes(state);
  }

  protected async emulatorSelected(emulator: SupportedEmulators): Promise<void> {
    const shim = this.createShim(emulator);
    if (!shim) return;
    if (!await shim.prepare()) {
      shim.dispose();
      return;
    }
    this.setShim(shim);
    shim.begin();
  }

  protected emulatorClosed(): void {
    this.setShim(null);
    this.emulatorSelection.setSelectedEmulator(SupportedEmulators.none);
    this.advanceLinkState(StepsState.ChooseEmulator);
  }

  protected gameMissing(): boolean {
    return !!this.shim && !this.shim.canStartLinkMode();
  }

  start() {
    this.shim?.startLinkMode();
  }

  disconnect(): void {
    this.shim?.disconnect();
  }

  private createShim(emulator: SupportedEmulators): LocalEmulatorShim | null {
    const host: LocalEmulatorShimHost = {
      advance: state => { if (this.shim === shim) this.advanceLinkState(state); },
      hasReached: state => this.hasReached(state),
      isCurrentlyIn: state => this.isCurrentlyIn(state),
    };
    const shim = runInInjectionContext(this.injector, () => {
      switch (emulator) {
        case SupportedEmulators.mGBA: return new MGBAEmulatorShim(host);
        case SupportedEmulators.browser: return new BrowserEmulatorShim(host);
        default: return null;
      }
    });
    return shim;
  }

  private setShim(shim: LocalEmulatorShim | null): void {
    if (this.shim && this.shim !== shim) this.shim.dispose();
    this.shim = shim;
  }
}
