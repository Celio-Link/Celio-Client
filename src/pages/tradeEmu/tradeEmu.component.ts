import {Component, inject, ChangeDetectorRef} from '@angular/core';
import {NgClass, NgForOf, NgIf} from '@angular/common';
import {Subscription} from 'rxjs';
import {PkmnFile} from './pkmnFile';
import {CableLink} from './cableLink';
import {CableTradePartner, TradePhase} from './cableTrade';
import {LinkDeviceService} from '../../services/linkdevice.service';
import {ToastService} from '../../services/toast.service';
import {CelioPageAbstract} from '../shared/celioPage.abstact';
import {CelioConnectionStatusComponent} from '../../component/panel/connect/connect.component';
import {EmulatorComponent} from '../../component/emulator/emulator.component';
import {EmulatorService} from '../../services/emulator.service';
import {StatusEmitterAbstract} from '../../shared/linkExchange/statusEmitter/statusEmitter.abstract';
import {StatusEmitterEmulator} from '../../shared/linkExchange/statusEmitter/statusEmitter.emulator';
import {StatusEmitterLinkDevice} from '../../shared/linkExchange/statusEmitter/statusEmitter.linkDevice';

enum StepsState {
  ConnectingCelioDevice = 0,
  SelectingPokemon = 1,
  StartingLinkMode = 2,
  Ready = 3,
}

const PARTY_SIZE = 6;

/** What the GBA is linked through: a GB-Link on USB or the emulator in the page. */
type LinkDevice = 'usb' | 'emulator';

@Component({
  selector: 'app-tradeEmu',
  standalone: true,
  imports: [
    NgIf,
    NgClass,
    NgForOf,
    CelioConnectionStatusComponent,
    EmulatorComponent
  ],
  templateUrl: './tradeEmu.component.html'
})
export class TradeEmuComponent extends CelioPageAbstract<StepsState>{

  private linkDeviceService = inject(LinkDeviceService)
  private toastService = inject(ToastService)
  protected emulatorService = inject(EmulatorService)

  protected StepsState = StepsState;
  protected device: LinkDevice | null = null;

  protected pkmFiles: PkmnFile[] = [];
  protected selectedIndex = 0;
  protected phase: TradePhase | null = null;

  private link: CableLink | null = null;
  private disconnectSubscription: Subscription;

  constructor(private changeDetector: ChangeDetectorRef) {
    super(changeDetector);
    this.stepState = StepsState.ConnectingCelioDevice;
    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(() => {
      if (this.device !== 'usb') return;
      this.stopLink();
      this.advanceLinkState(StepsState.ConnectingCelioDevice)
    })
  }

  ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.device = 'usb';
      this.stepState = StepsState.SelectingPokemon;
    } else if (this.emulatorService.game()) {
      this.device = 'emulator';
      this.stepState = StepsState.SelectingPokemon;
    }
  }

  ngOnDestroy() {
    this.disconnectSubscription.unsubscribe();
    this.stopLink();
  }

  /** The device the trade talks to. */
  private createStatusEmitter(): StatusEmitterAbstract {
    if (this.device !== 'emulator') return new StatusEmitterLinkDevice(this.linkDeviceService);
    const adapter = this.emulatorService.linkAdapter;
    // The page only goes on once the emulator has loaded
    if (!adapter) throw new Error('The emulator has not loaded.');
    return new StatusEmitterEmulator(adapter);
  }

  protected usbConnected(): void {
    this.device = 'usb';
    this.advanceLinkState(StepsState.SelectingPokemon);
  }

  /** The emulator in the page is the device: the Pokémon can be chosen while the player chooses the game. */
  protected async useEmulator(): Promise<void> {
    this.device = 'emulator';
    if (!await this.emulatorService.prepare()) {
      this.device = null;
      this.toastService.show('The emulator didn\'t load. Check your connection and try again.', 'error', 5000);
      return;
    }
    this.advanceLinkState(StepsState.SelectingPokemon);
  }

  /** Closing the emulator goes back to choosing how to link. */
  protected emulatorClosed(): void {
    this.stopLink();
    this.device = null;
    this.advanceLinkState(StepsState.ConnectingCelioDevice);
  }

  /** The emulator needs its game before the link mode can start. */
  protected gameMissing(): boolean {
    return this.device === 'emulator' && !this.emulatorService.game();
  }

  // Every chosen file in order, as many as the party has room for
  async slotSelected($event: Event) {
    const input = $event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) {
      try {
        const pkmFile = await PkmnFile.fromFile(file);
        if (this.pkmFiles.length >= PARTY_SIZE) break;
        this.pkmFiles.push(pkmFile);
        this.changeDetector.detectChanges();
      } catch (error) {
        this.toastService.show((error as Error).message, 'error', 4000);
      }
    }
  }

  select(index: number) {
    this.selectedIndex = index;
  }

  remove(index: number) {
    this.pkmFiles = this.pkmFiles.filter((_, i) => i !== index);
    if (this.selectedIndex >= index && this.selectedIndex > 0) this.selectedIndex--;
  }

  download(index: number) {
    const pkmFile = this.pkmFiles[index];
    const url = URL.createObjectURL(new Blob([pkmFile.decryptedBuffer.slice()], {type: 'application/octet-stream'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = pkmFile.name.replace(/\.[ep]k3$/i, '') + '.pk3';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url));
  }

  confirmSelection() {
    this.advanceLinkState(StepsState.StartingLinkMode);
  }

  start() {
    if (this.link || this.gameMissing()) return;
    const partner = new CableTradePartner({
      party: () => ({mons: this.pkmFiles.map(pkmFile => pkmFile.encryptedBuffer), selected: this.selectedIndex}),
      events: {
        phase: phase => {
          this.phase = phase;
          this.changeDetector.detectChanges();
        },
        traded: (slot, received) => this.traded(slot, received),
        otherRoom: () => this.toastService.show('Only the Trade Center is available here. Choose it at the Pokémon Center clerk.', 'warning', 6000),
      },
    });
    const link = this.link = new CableLink(this.createStatusEmitter(), partner);
    link.start()
      .then(() => this.advanceLinkState(StepsState.Ready))
      .catch(error => {
        this.link = null;
        this.toastService.show(String(error?.message ?? error), 'error', 4000);
      });
  }

  disconnect(): void {
    this.stopLink();
    this.advanceLinkState(StepsState.SelectingPokemon)
  }

  protected phaseText(): string {
    switch (this.phase) {
      case 'linkup': return 'Linking up with your game...';
      case 'room': return 'Take a seat at the table to open the trade menu.';
      case 'menu': return 'Choose a Pokémon on your game. This page trades the one highlighted above.';
      case 'trading': return 'Trading...';
      default: return '';
    }
  }

  private traded(slot: number, received: Uint8Array) {
    const pkmFile = PkmnFile.fromTraded(received);
    this.pkmFiles[slot] = pkmFile;
    this.toastService.show(`Received ${pkmFile.pokemonName}`, 'info', 4000);
    this.changeDetector.detectChanges();
  }

  private stopLink() {
    this.link?.stop();
    this.link = null;
    this.phase = null;
  }
}
