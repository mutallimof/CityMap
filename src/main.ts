import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import { createMap } from './map/createMap';
import { mountDebugPanel } from './debug/panel';
import { CONFIG } from './config';

function applyCssTokens() {
  const r = document.documentElement.style;
  r.setProperty('--water', CONFIG.colors.day.water);
  r.setProperty('--label-text', CONFIG.colors.labelText);
  r.setProperty('--label-halo', CONFIG.colors.labelHalo);
  r.setProperty('--font', CONFIG.labels.fontFamily);
}

async function boot() {
  applyCssTokens();
  const container = document.getElementById('map')!;
  const map = await createMap(container);
  mountDebugPanel(map);
  // Exposed for console tinkering during development only.
  if (import.meta.env.DEV) (window as unknown as { map: typeof map }).map = map;
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre class="boot-error">${String(err)}</pre>`);
});
