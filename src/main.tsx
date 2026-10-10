import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import type { GeoJSONSource } from 'maplibre-gl';
import { createMap } from './map/createMap';
import { setLandmarkLang } from './map/city-setup';
import { mountDebugPanel } from './debug/panel';
import { CONFIG } from './config';
import { loadLines, loadPlaces, loadRoutes } from './data/load';
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
import { WeatherController } from './weather/controller';
import { WeatherLayer } from './weather/weather-layer';
import { prefersReducedMotion } from './app/motion';
import { startAdaptiveQuality } from './app/perf';
import { hideLoader, playIntro } from './map/intro';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { setServices } from './ui/services';
import { bindMapInteractions } from './ui/map-interactions';
import { ui } from './ui/store';
import './ui/ui.css';
import './places/pins.css';
import './places/ui/places.css';
import { PlacesStore } from './places/store';
import { PlacePins, SelectedPlaceMarker } from './places/pins';
import { PoiLayer } from './places/poi-layer';
import { openPier, openPlace, setPlaces } from './places/ui/context';
import { FeedBody, FeedHeader } from './places/ui/Feed';
import { PlaceBody, PlaceHeader } from './places/ui/PlaceSheet';
import { NearbyPlaces, WeatherChip } from './places/ui/Extras';

function parseDeepLink(): { kind: 'place' | 'pier'; id: string } | null {
  const m = /^#(place|pier)=(.+)$/.exec(location.hash);
  return m ? { kind: m[1] as 'place' | 'pier', id: decodeURIComponent(m[2]) } : null;
}
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
  // Deep links (#place=… / #pier=…) skip the intro and open straight on the target.
  const deep = parseDeepLink();
  const intro = withIntro && !deep;
  const [{ map, piers, land, city }, lines, routes, placeData] = await Promise.all([
    createMap(container, intro),
    loadLines(),
    loadRoutes(),
    loadPlaces(),
  ]);

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
  const weather = new WeatherController(() => clock.now());
  const weatherLayer = new WeatherLayer();
  weatherLayer.reduceMotion = reduced;
  map.addLayer(weatherLayer);
  weather.start();
  const daylight = new DaylightController({ map, water, ferries, clock, city, weather, weatherLayer });
  daylight.start();

  water.motion = reduced ? 0.25 : 1;
  ferries.reduceMotion = reduced;
  const pierById = new Map(piers.features.map((f) => [f.properties.id, { ...f.properties, lngLat: f.geometry.coordinates as [number, number] }]));
  setServices({ map, clock, daylight, ferries, weather, network, getDay, lines, lineById: new Map(lines.map((l) => [l.id, l])), piers, pierById });
  // Places — all real OpenStreetMap data: featured pins + every map POI (revealed by zoom).
  const store = new PlacesStore(placeData);
  setPlaces(store, reduced);
  const poi = new PoiLayer(map, store.places.map((p) => p.osm));
  bindMapInteractions(undefined, (e) => {
    const p = poi.at(e.point);
    if (!p) return undefined;
    store.add(p);
    openPlace(p.id);
    return { kind: 'place', id: p.id };
  });
  document.documentElement.lang = ui.get().lang;
  setLandmarkLang(ui.get().lang);
  let lastLang = ui.get().lang;
  ui.subscribe(() => {
    if (ui.get().lang !== lastLang) setLandmarkLang((lastLang = ui.get().lang));
  });
  document.documentElement.classList.toggle('motion-reduced', reduced);

  const pins = new PlacePins(map, store, (p) => openPlace(p.id, false));
  const picked = new SelectedPlaceMarker(map);
  let lastPoi = '';
  const refreshPins = () => {
    const s = ui.get();
    const selectedId = s.selection?.kind === 'place' ? s.selection.id : null;
    pins.update({
      categories: s.categories,
      openNow: s.openNow,
      selectedId,
      golden: daylight.theme.night < 0.5 ? daylight.theme.golden : 0,
      night: daylight.theme.night,
      nowMs: clock.now(),
    });
    const key = `${s.categories.join()}|${s.openNow}`;
    if (key !== lastPoi) {
      lastPoi = key;
      poi.setFilters({ categories: s.categories, openNow: s.openNow, visible: true });
    }
    poi.setNight(daylight.theme.night);
    const sel = selectedId ? store.byId.get(selectedId) : undefined;
    picked.show(sel?.source === 'osm' ? sel : null);
  };
  store.onChange(refreshPins);
  ui.subscribe(refreshPins);
  daylight.onChange(refreshPins);
  clock.onChange(refreshPins);
  setInterval(refreshPins, 30_000);
  refreshPins();

  createRoot(document.getElementById('ui')!).render(
    <App
      introMs={intro ? CONFIG.camera.intro.durationMs : 0}
      categories
      topExtra={<WeatherChip />}
      feed={{ header: <FeedHeader />, body: <FeedBody /> }}
      placeSheet={(id) => ({ header: <PlaceHeader id={id} />, body: <PlaceBody id={id} /> })}
      nearbyPier={(id) => <NearbyPlaces pierId={id} />}
    />,
  );

  hideLoader();
  if (params.get('adaptive') !== '0') setTimeout(() => startAdaptiveQuality(map), (intro ? CONFIG.camera.intro.durationMs : 0) + 1500);
  if (intro) void playIntro(map);
  if (deep?.kind === 'place') openPlace(deep.id);
  if (deep?.kind === 'pier') openPier(deep.id);

  mountDebugPanel(map, { clock, vesselCount: () => ferries.visible.length });
  // Exposed for console tinkering during development only.
  if (import.meta.env.DEV) Object.assign(window, { map, clock, network, getDay, ferries, water, daylight, store, weather, weatherLayer, city, ui, poi });
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre class="boot-error">${String(err)}</pre>`);
});
