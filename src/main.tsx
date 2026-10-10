import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import type { GeoJSONSource } from 'maplibre-gl';
import { createMap } from './map/createMap';
import { mountDebugPanel } from './debug/panel';
import { CONFIG } from './config';
import { loadLines, loadRoutes } from './data/load';
import { buildNetwork } from './sim/network';
import { buildDaySchedule } from './sim/schedule';
import { cachedDays } from './sim/state';
import { toIstanbul } from './sim/time';
import { fleetAt } from './sim/fleet';
import { ClockController } from './app/clock';
import { VapurLayer } from './ferries/vapur-layer';
import { WaterLayer } from './water/water-layer';
import { LAYER, SOURCE } from './map/style';
import { DaylightController } from './app/daylight';
import { prefersReducedMotion } from './app/motion';
import { startAdaptiveQuality } from './app/perf';
import { hideLoader, playIntro } from './map/intro';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { setServices } from './ui/services';
import { bindMapInteractions } from './ui/map-interactions';
import { ui } from './ui/store';
import './ui/ui.css';
import { stressInputs } from './sim/stress';

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
  const reduced = prefersReducedMotion();
  const params = new URLSearchParams(location.search);
  const withIntro = !reduced && params.get('intro') !== '0';
  const [{ map, piers, land }, lines, routes] = await Promise.all([createMap(container, withIntro), loadLines(), loadRoutes()]);

  (map.getSource(SOURCE.routes) as GeoJSONSource).setData(routes);
  const [, s, , n] = CONFIG.bounds;
  const berths = piers.features.flatMap((f) => f.properties.berths);
  const network = buildNetwork(lines, routes, (s + n) / 2, berths);
  const docking = { turnSeconds: CONFIG.ferries.dockTurnSeconds, berthBlendM: CONFIG.ferries.berthBlendM };
  const clock = new ClockController();
  // ?stress=40 → denser all-day timetable with at least 40 vessels on the water (perf testing).
  const stress = Number(new URLSearchParams(location.search).get('stress'));
  let inputs = network.inputs;
  if (stress > 0) {
    const r = stressInputs(network.inputs, stress, toIstanbul(clock.now()));
    inputs = r.inputs;
    console.info(`stress mode: ${stress} vessels → every line every ${r.headway} min`);
  }
  const getDay = cachedDays((day) => buildDaySchedule(inputs, day));
  const colors = new Map(lines.map((l) => [l.id, l.color]));

  const ferries = new VapurLayer({
    poses: () => fleetAt(getDay, network.paths, toIstanbul(clock.now()), docking),
    paths: network.paths,
    docking,
    lineColor: (id) => colors.get(id) ?? '#ffffff',
  });
  const water = new WaterLayer(land);
  map.addLayer(water, LAYER.land);
  map.addLayer(ferries);
  const daylight = new DaylightController({ map, water, ferries, clock });
  daylight.start();

  water.motion = reduced ? 0.25 : 1;
  ferries.reduceMotion = reduced;
  const pierById = new Map(piers.features.map((f) => [f.properties.id, { ...f.properties, lngLat: f.geometry.coordinates as [number, number] }]));
  setServices({ map, clock, daylight, ferries, network, getDay, lines, lineById: new Map(lines.map((l) => [l.id, l])), piers, pierById });
  bindMapInteractions();
  document.documentElement.lang = ui.get().lang;
  createRoot(document.getElementById('ui')!).render(<App introMs={withIntro ? CONFIG.camera.intro.durationMs : 0} />);

  hideLoader();
  if (params.get('adaptive') !== '0') setTimeout(() => startAdaptiveQuality(map), (withIntro ? CONFIG.camera.intro.durationMs : 0) + 1500);
  if (withIntro) void playIntro(map);

  mountDebugPanel(map, { clock, vesselCount: () => ferries.visible.length });
  // Exposed for console tinkering during development only.
  if (import.meta.env.DEV) Object.assign(window, { map, clock, network, getDay, ferries, water, daylight });
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre class="boot-error">${String(err)}</pre>`);
});
