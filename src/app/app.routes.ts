import { Routes } from '@angular/router';
import { LayoutComponent } from '../layout/layout.component';
import { OnlineLinkComponent } from '../pages/onlineLink/onlineLink.component';
import { TradeEmuComponent } from '../pages/tradeEmu/tradeEmu.component';
import { EmulatorLinkComponent } from '../pages/emulatorLink/emulatorLink.component';
import {EmulatorOnlineLinkComponent} from '../pages/emulatorOnlineLink/emulatorOnlineLink.component';
import { Mode } from '../shared/linkExchange/common';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent, // persistent sidebar
    children: [
      { path: '', redirectTo: 'onlineLink', pathMatch: 'full' },
      { path: 'onlineLink', component: OnlineLinkComponent,
        data: { linkMode: Mode.onlineLink, readyInstruction: "Link Mode is now ready! If you haven't already, connect the <br> Link-Cable to your Gameboy Advance and talk to the Pokémon Center clerk." } },
      // No awVariant in the route data: the page asks the user to pick
      // Advance Wars 1 or 2 before connecting, which also sets the
      // ready-screen copy.
      { path: 'advanceWarsLink', component: OnlineLinkComponent,
        data: { linkMode: Mode.advanceWars } },
      { path: 'tradeEmu', component: TradeEmuComponent },
      { path: 'emulatorLink', component: EmulatorLinkComponent },
      { path: 'emulatorOnlineLink', component: EmulatorOnlineLinkComponent }
    ]
  }
];
