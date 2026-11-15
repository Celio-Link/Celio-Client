import {Component, ChangeDetectorRef, ViewChild, inject, EnvironmentInjector, runInInjectionContext} from '@angular/core';
import {NgClass, NgIf} from '@angular/common';
import {LinkExchangeSession} from '../../shared/linkExchange/linkExchangeSession';
import {EmulatorSelectionService, SupportedEmulators} from '../../services/emulatorSelection.service';
import {SocketIOService} from '../../services/socketIO.service';
import {CommandEmitterSocketIO} from '../../shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {CelioPageAbstract} from '../shared/celioPage.abstact';
import {CelioSessionComponent} from '../../component/panel/session/session.compomemt';
import {EmulatorComponent} from '../../component/emulator/emulator.component';
import {EmulatorWindowService} from '../../services/emulatorWindow.service';
import {StepsState} from './stepsState';
import {OnlineEmulatorShim, OnlineEmulatorShimHost} from './emulators/emulator.abstract';
import {BrowserEmulatorShim} from './emulators/emulator.browser';
import {MGBAEmulatorShim} from './emulators/emulator.mGBA';

@Component({
  selector: 'app-tradeEmu',
  standalone: true,
  imports: [
    NgIf,
    NgClass,
    CelioSessionComponent,
    EmulatorComponent
  ],
  templateUrl: './emulatorOnlineLink.component.html'
})
export class EmulatorOnlineLinkComponent extends CelioPageAbstract<StepsState>{
  @ViewChild(CelioSessionComponent) sessionPanel!: CelioSessionComponent;

  private socket = inject(SocketIOService);
  private emulatorSelection = inject(EmulatorSelectionService);
  private injector = inject(EnvironmentInjector);
  protected emulatorWindow = inject(EmulatorWindowService);

  protected StepsState = StepsState;
  protected readonly SupportedEmulators = SupportedEmulators;

  /** The chosen emulator's steps; null until one is chosen. */
  private shim: OnlineEmulatorShim | null = null;

  constructor(cd: ChangeDetectorRef) {
    super(cd);
    this.stepState = StepsState.ChooseEmulator;
  }

  ngOnInit() {
    const shim = this.createShim(this.emulatorSelection.getSelectedEmulator());
    if (!shim) return;
    this.shim = shim;
    if (!shim.resume()) {
      this.shim = null;
      shim.dispose();
    }
  }

  ngAfterViewInit() {
    this.sessionPanel.createSessionEvent.subscribe(() => {
      const device = this.shim?.sessionDevice();
      if (device) this.sessionPanel.setLinkSession(new LinkExchangeSession(new CommandEmitterSocketIO(this.socket), device));
    })
    this.sessionPanel.sessionStateChange.subscribe(state => this.shim?.sessionStateChanged(state))
  }

  ngOnDestroy() {
    this.setShim(null);
  }

  /** The emulator in the page was chosen: it is the device of the session, like a GBA on a GB-Link. */
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

  /** Closing the emulator goes back to choosing one. */
  protected emulatorClosed(): void {
    this.setShim(null);
    this.emulatorSelection.setSelectedEmulator(SupportedEmulators.none);
    this.advanceLinkState(StepsState.ChooseEmulator);
  }

  /** The emulator needs its game before the link mode can start. */
  protected gameMissing(): boolean {
    return !!this.shim && !this.shim.canStartLinkMode();
  }

  start() {
    this.shim?.startLinkMode();
  }

  disconnect(): void {
    this.shim?.disconnect();
  }

  private createShim(emulator: SupportedEmulators): OnlineEmulatorShim | null {
    const host: OnlineEmulatorShimHost = {
      advance: state => { if (this.shim === shim) this.advanceLinkState(state); },
      hasReached: state => this.hasReached(state),
      isCurrentlyIn: state => this.isCurrentlyIn(state),
      leaveSession: () => { if (this.shim === shim) this.sessionPanel.leaveSession(); },
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

  /** The session links the old emulator's device: it ends with it. */
  private setShim(shim: OnlineEmulatorShim | null): void {
    const old = this.shim;
    this.shim = shim;
    if (!old || old === shim) return;
    old.dispose();
    this.sessionPanel?.leaveSession();
  }
}
