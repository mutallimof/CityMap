import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import type { GeoJSONSource } from 'maplibre-gl';
import { createMap } from './map/createMap';
import { SOURCE } from './map/style';
import { mountDebugPanel } from './debug/panel';
import { CONFIG } from './config';
import { loadLines, loadRoutes } from './data/load';
import { buildNetwork } from './sim/network';
import { buildDaySchedule } from './sim/schedule';
import { cachedDays } from './sim/state';
import { toIstanbul } from './sim/time';
import { fleetAt } from './sim/fleet';
import { ClockController } from './app/clock';
import { ArrowsLayer } from './ferries/arrows-layer';

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
  const [{ map }, lines, routes] = await Promise.all([createMap(container), loadLines(), loadRoutes()]);

  (map.getSource(SOURCE.routes) as GeoJSONSource).setData(routes);
  const [, s, , n] = CONFIG.bounds;
  const network = buildNetwork(lines, routes, (s + n) / 2);
  const getDay = cachedDays((day) => buildDaySchedule(network.inputs, day));
  const colors = new Map(lines.map((l) => [l.id, l.color]));
  const clock = new ClockController();

  const ferries = new ArrowsLayer({
    poses: () => fleetAt(getDay, network.paths, toIstanbul(clock.now())),
    lineColor: (id) => colors.get(id) ?? '#ffffff',
  });
  map.addLayer(ferries);

  mountDebugPanel(map, { clock, vesselCount: () => ferries.visible.length });
  // Exposed for console tinkering during development only.
  if (import.meta.env.DEV) Object.assign(window, { map, clock, network, getDay });
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre class="boot-error">${String(err)}</pre>`);
});
