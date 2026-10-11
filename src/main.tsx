import { FilterHint } from './places/ui/FilterHint';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import type { GeoJSONSource } from 'maplibre-gl';
import { createMap } from './map/createMap';
import { setLabelLang, setLabelNight } from './map/labels';
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
import { initPwa } from './app/pwa';
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
import { SelectedPlaceMarker } from './places/pins';
import { PlaceLayers } from './places/place-layers';
import { setStories, storyFor, type Story } from './stories/stories';
import storiesUrl from '../data/stories.json?url';
import eventsUrl from '../data/events.json?url';
import { events, type CityEvent } from './events/events';
import { EventPulses } from './events/pulses';
import { setSearchData } from './search/SearchPanel';
import guidesCatalog from '../data/catalog/guides.json';
import { resolveGuide, type GuideDeps, type GuideSpec } from './guides/guides';
import { addGuideLayers } from './guides/layer';
import { bindGuideSelection, GuideBody, GuideHeader, GuidesRow, openGuide, setGuides } from './guides/ui';
import { flyTo, openPier, openPlace, setPlaces } from './places/ui/context';
import { FeedBody, FeedHeader } from './places/ui/Feed';
import { PlaceBody, PlaceHeader } from './places/ui/PlaceSheet';
import { NearbyPlaces, WeatherChip } from './places/ui/Extras';

function parseDeepLink(): { kind: 'place' | 'pier' | 'guide'; id: string } | null {
  const m = /^#(place|pier|guide)=(.+)$/.exec(location.hash);
  return m ? { kind: m[1] as 'place' | 'pier' | 'guide', id: decodeURIComponent(m[2]) } : null;
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
  initPwa();
  const container = document.getElementById('map')!;
  const reduced = prefersReducedMotion();
  const params = new URLSearchParams(location.search);
  const withIntro = !reduced && params.get('intro') !== '0';
  // Deep links (#place=… / #pier=…) skip the intro and open straight on the target.
  const deep = parseDeepLink();
  const intro = withIntro && !deep;
  const [{ map, piers, land, city, districts, landmarks }, lines, routes, placeData] = await Promise.all([
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
  setSearchData({ districts, landmarks });
  setPlaces(store, reduced);
  const placeLayers = new PlaceLayers(map, store, landmarks);
  bindMapInteractions(undefined, (e) => {
    const hit = placeLayers.at(e.point);
    if (!hit) return undefined;
    if ('featured' in hit) {
      openPlace(hit.featured);
      return { kind: 'place', id: hit.featured };
    }
    if ('landmark' in hit) {
      const l = hit.landmark;
      if (!l.osm) {
        flyTo(l.lngLat, 15.2);
        return null;
      }
      const p = store.add({ id: `osm:${l.osm}`, name: l.name ?? '', nameEn: l.nameEn ?? null, category: 'culture', kind: 'attraction', osm: l.osm, district: null, hours: null, cuisine: null, lngLat: l.lngLat, source: 'osm' });
      openPlace(p.id);
      return { kind: 'place', id: p.id };
    }
    if ('story' in hit) {
      const st = storyFor(hit.story);
      if (!st) return undefined;
      const p = store.add({ id: `osm:${st.osm}`, name: st.name.tr || st.name.en, nameEn: st.name.en || null, category: 'culture', kind: st.kind, osm: st.osm, district: null, hours: null, cuisine: null, lngLat: st.lngLat, source: 'osm' });
      openPlace(p.id);
      return { kind: 'place', id: p.id };
    }
    const p = store.add(hit.poi);
    openPlace(p.id);
    return { kind: 'place', id: p.id };
  });
  document.documentElement.lang = ui.get().lang;
  document.documentElement.classList.toggle('motion-reduced', reduced);

  // Guides (seed): stops reference our OSM-derived places, piers and landmarks.
  addGuideLayers(map);
  const lineColor = new Map(lines.map((l) => [l.id, l.color]));
  const guideDeps: GuideDeps = {
    place: (id) => {
      const p = store.byId.get(id);
      return p && { name: { tr: p.name, en: p.nameEn ?? p.name }, lngLat: p.lngLat, icon: '' };
    },
    pier: (id) => {
      const p = pierById.get(id);
      return p && { name: { tr: p.name, en: p.nameEn }, lngLat: p.lngLat, icon: '⚓' };
    },
    landmark: (id) => {
      const f = landmarks.features.find((x) => x.properties.id === id && x.geometry.type === 'Point');
      return f && { name: { tr: f.properties.name ?? id, en: f.properties.nameEn ?? id }, lngLat: (f.geometry as GeoJSON.Point).coordinates as [number, number], icon: '' };
    },
    line: (id) => {
      const r = routes.features.find((x) => x.properties.lineId === id);
      return r && { coords: r.geometry.coordinates as [number, number][], stops: r.properties.stops, stopVertex: r.properties.stopVertex, color: lineColor.get(id) ?? '#E0A100' };
    },
  };
  setGuides(
    (guidesCatalog.guides as GuideSpec[]).flatMap((g) => {
      try {
        return [resolveGuide(g, guideDeps)];
      } catch (err) {
        console.warn(err);
        return [];
      }
    }),
  );
  bindGuideSelection();

  const picked = new SelectedPlaceMarker(map);
  const pulses = new EventPulses(map);
  let labelState = '';
  const refreshPins = () => {
    const s = ui.get();
    const selectedId = s.selection?.kind === 'place' ? s.selection.id : null;
    const night = daylight.theme.night;
    const nowMs = clock.now();
    placeLayers.update({ categories: s.categories, openNow: s.openNow, nowMs, night, golden: night < 0.5 ? daylight.theme.golden : 0, lang: s.lang, ev: s.ev });
    pulses.update(store.places.filter((p) => events.status(p.id, nowMs) === 'now' && store.visible(p.id, s, nowMs)).map((p) => ({ id: p.id, lngLat: p.lngLat })));
    const ls = `${s.lang}|${night > 0.5}`;
    if (ls !== labelState) {
      labelState = ls;
      setLabelLang(map, s.lang);
      setLabelNight(map, night > 0.5);
    }
    picked.show(selectedId ? store.byId.get(selectedId) ?? null : null);
  };
  store.onChange(refreshPins);
  events.onChange(refreshPins);
  ui.subscribe(refreshPins);
  daylight.onChange(refreshPins);
  clock.onChange(refreshPins);
  setInterval(refreshPins, 30_000);
  refreshPins();

  createRoot(document.getElementById('ui')!).render(
    <App
      introMs={intro ? CONFIG.camera.intro.durationMs : 0}
      categories
      filterHint={<FilterHint />}
      topExtra={<WeatherChip />}
      feed={{ header: <FeedHeader />, body: <FeedBody extra={<GuidesRow />} /> }}
      guideSheet={(id) => ({ header: <GuideHeader id={id} />, body: <GuideBody id={id} /> })}
      placeSheet={(id) => ({ header: <PlaceHeader id={id} />, body: <PlaceBody id={id} /> })}
      nearbyPier={(id) => <NearbyPlaces pierId={id} />}
    />,
  );

  hideLoader();
  // Events (scraped daily) and stories (history) load after the map is up — never blocking.
  void fetch(eventsUrl)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { events: CityEvent[] } | null) => j && events.set(j.events))
    .catch(() => undefined);
  void fetch(storiesUrl)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { stories: Record<string, Story> } | null) => {
      if (!j) return;
      setStories(j.stories);
      placeLayers.setStories(Object.values(j.stories));
      refreshPins();
    })
    .catch(() => undefined);
  if (params.get('adaptive') !== '0')
    setTimeout(
      () =>
        startAdaptiveQuality(map, (k) => {
          if (k.particles !== undefined) weatherLayer.quality = k.particles;
          if (k.gulls !== undefined) ferries.gullsEnabled = k.gulls;
          if (k.windows !== undefined) city.knobs.windows = k.windows;
          if (k.buildings !== undefined) city.knobs.buildings = k.buildings;
          daylight.update();
        }),
      (intro ? CONFIG.camera.intro.durationMs : 0) + 1500,
    );
  if (intro) void playIntro(map);
  if (deep?.kind === 'place') openPlace(deep.id);
  if (deep?.kind === 'pier') openPier(deep.id);
  if (deep?.kind === 'guide') openGuide(deep.id);

  mountDebugPanel(map, { clock, vesselCount: () => ferries.visible.length });
  // Exposed for console tinkering during development only.
  if (import.meta.env.DEV) Object.assign(window, { map, clock, network, getDay, ferries, water, daylight, store, weather, weatherLayer, city, ui, placeLayers });
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre class="boot-error">${String(err)}</pre>`);
});
