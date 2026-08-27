/**
 * Demo entry point. Bundled by scripts/build-demo.mjs into a single HTML file
 * that runs offline from the filesystem — no server, no network, no accounts.
 */

import { initStore } from './store';
import { attachHandlers, render } from './ui';

function boot(): void {
  initStore();
  attachHandlers();
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
