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
      { path: 'advanceWarsLink', component: OnlineLinkComponent,
        data: { linkMode: Mode.advanceWars, awVariant: 1, readyInstruction: "Link Mode is now ready! Connect the Link Cable to both Game Boy Advances <br> and start a VS battle from the Advance Wars menu." } },
      { path: 'advanceWars2Link', component: OnlineLinkComponent,
        data: { linkMode: Mode.advanceWars, awVariant: 2, readyInstruction: "Link Mode is now ready! Connect the Link Cable to both Game Boy Advances <br> and start a VS battle from the Advance Wars 2 menu." } },
      { path: 'tradeEmu', component: TradeEmuComponent },
      { path: 'emulatorLink', component: EmulatorLinkComponent },
      { path: 'emulatorOnlineLink', component: EmulatorOnlineLinkComponent }
    ]
  }
];
