import {Component, inject, ChangeDetectorRef, ViewChild} from '@angular/core';
import {NgClass, NgForOf, NgIf} from '@angular/common';
import {Subscription} from 'rxjs';
import {PkmnFile} from './pkmnFile';
import {CableLink} from './cableLink';
import {CableTradePartner, TradePhase} from './cableTrade';
import {LinkDeviceService} from '../../services/linkdevice.service';
import {ToastService} from '../../services/toast.service';
import {CelioPageAbstract} from '../shared/celioPage.abstact';
import {CelioConnectionStatusComponent} from '../../component/panel/connect/connect.component';

enum StepsState {
  ConnectingCelioDevice = 0,
  SelectingPokemon = 1,
  StartingLinkMode = 2,
  Ready = 3,
}

const PARTY_SIZE = 6;

@Component({
  selector: 'app-tradeEmu',
  standalone: true,
  imports: [
    NgIf,
    NgClass,
    NgForOf,
    CelioConnectionStatusComponent
  ],
  templateUrl: './tradeEmu.component.html'
})
export class TradeEmuComponent extends CelioPageAbstract<StepsState>{

  @ViewChild(CelioConnectionStatusComponent) connectionPanel!: CelioConnectionStatusComponent;

  private linkDeviceService = inject(LinkDeviceService)
  private toastService = inject(ToastService)

  protected StepsState = StepsState;

  protected pkmFiles: PkmnFile[] = [];
  protected selectedIndex = 0;
  protected phase: TradePhase | null = null;

  private link: CableLink | null = null;
  private disconnectSubscription: Subscription;

  constructor(private changeDetector: ChangeDetectorRef) {
    super(changeDetector);
    this.stepState = StepsState.ConnectingCelioDevice;
    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(() => {
      this.stopLink();
      this.advanceLinkState(StepsState.ConnectingCelioDevice)
    })
  }

  ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.stepState = StepsState.SelectingPokemon;
    }
  }

  ngAfterViewInit() {
    this.connectionPanel.next.subscribe(() => { this.advanceLinkState(StepsState.SelectingPokemon);})
  }

  ngOnDestroy() {
    this.disconnectSubscription.unsubscribe();
    this.stopLink();
  }

  slotSelected($event: Event) {
    const input = $event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.pkmFiles.length >= PARTY_SIZE) return;
    PkmnFile.fromFile(file)
      .then(pkmFile => {
        this.pkmFiles.push(pkmFile);
        this.changeDetector.detectChanges();
      })
      .catch((error: Error) => this.toastService.show(error.message, 'error', 4000))
      .finally(() => { input.value = ''; });
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
    if (this.link) return;
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
    const link = this.link = new CableLink(this.linkDeviceService, partner);
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
