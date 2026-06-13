import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {NgOptimizedImage} from '@angular/common';

// Whether this client was opened from the GB Link launcher (?from=gblink-launcher).
// Captured at module load — before Angular's router runs its initial navigation,
// which strips the query param from the URL. We also remember it in sessionStorage
// so the state survives page reloads (the URL no longer carries ?from by then).
// sessionStorage is per-tab and clears when the tab closes, so a fresh tab opened
// straight to Celio won't show the button.
const FROM_LAUNCHER = (() => {
  const KEY = 'gblink-from-launcher';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('from') === 'gblink-launcher';
    if (fromUrl) sessionStorage.setItem(KEY, '1');
    return fromUrl || sessionStorage.getItem(KEY) === '1';
  } catch {
    return new URLSearchParams(window.location.search).get('from') === 'gblink-launcher';
  }
})();

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html'
})
export class SidebarComponent {
  // When this client was opened from the GB Link launcher (?from=gblink-launcher),
  // show a "Return to Launcher" sidebar item so users can hop back to it.
  protected readonly launcherUrl = 'https://launcher.gblink.io';
  protected readonly fromLauncher = FROM_LAUNCHER;
}
