/**
 * Every visual / tunable constant lives here so the look can be tuned in one place.
 * Units are noted per field. Colours are CSS hex.
 */

export const CONFIG = {
  /** Data area from plan §4.6: [west, south, east, north]. */
  bounds: [28.8, 40.82, 29.3, 41.26] as [number, number, number, number],

  camera: {
    /** Karaköy – Kadıköy – Üsküdar triangle, Bosphorus mouth. */
    center: [29.0, 41.018] as [number, number],
    /** Close enough that ferries read at a glance (~40 px long). */
    zoom: 13.1,
    pitch: 46,
    bearing: -18,
    /** Intro: start high above the Sea of Marmara, fly in to the view above. */
    intro: { center: [28.99, 40.93] as [number, number], zoom: 10.4, pitch: 0, bearing: 0, durationMs: 3400 },
    minZoom: 10,
    maxZoom: 17.5,
    maxPitch: 65,
    /** How far past the data bounds the camera centre may wander (degrees). */
    boundsPadding: 0.02,
  },

  colors: {
    day: {
      water: '#1F5E6E',
      /** Lighter shallow-water band hugging the coast. */
      waterShallow: '#2E8C9A',
      land: '#F3E9D7',
      /** 1–2 px lighter highlight right on the shoreline. */
      shoreHighlight: '#FFF9EE',
      /** Soft inner shadow drawn just inside the land edge. */
      landInnerShadow: '#C9B89A',
      sky: '#BFE3E8',
      horizon: '#E8F1EC',
      fog: '#D9ECEB',
    },
    /** Golden hour / sunset (sun 0–8° up) and twilight blend through this. */
    sunset: {
      water: '#2A5C6E',
      waterShallow: '#4E8C94',
      land: '#F2D9BE',
      shoreHighlight: '#FFE9CF',
      landInnerShadow: '#C79C7A',
      sky: '#F7B98B',
      horizon: '#F6CFA0',
      fog: '#EBC3A2',
    },
    night: {
      water: '#0A2431',
      waterShallow: '#12404E',
      land: '#1B1E26',
      shoreHighlight: '#5E9CAC',
      landInnerShadow: '#0F131B',
      sky: '#0B1424',
      horizon: '#1A2A3C',
      fog: '#122030',
    },
    /** Classic İstanbul vapur palette. */
    vapur: {
      hull: '#F7F4EC',
      hullBottom: '#2A2E35',
      deck: '#E4DACA',
      house: '#FBFAF6',
      windows: '#34404C',
      roof: '#D8D3C8',
      funnel: '#E8B22E',
      funnelTop: '#1E1F22',
      mast: '#3A3D42',
    },
    accentGold: '#E0A100',
    sunsetCoral: '#F08A5D',
    pier: '#FFFFFF',
    pierStroke: '#1F5E6E',
    labelText: '#5A4B3A',
    labelHalo: 'rgba(243, 233, 215, 0.85)',
    labelHaloHex: '#F3E9D7',
    labelTextNight: '#E9E1D2',
    labelHaloNight: '#141A24',
  },

  /**
   * The city from OpenStreetMap (OpenFreeMap vector tiles, OpenMapTiles schema), in our own palette.
   * Palettes blend day → golden → night like the base palette; seasons tint vegetation; weather
   * (wet / snow / overcast) is applied on top in src/map/city-look.ts.
   */
  city: {
    tiles: 'https://tiles.openfreemap.org/planet',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    font: ['Noto Sans Regular'],
    fontBold: ['Noto Sans Bold'],
    /** Pastel neighbourhoods: residential areas pick one of these by feature id. */
    residentialOpacity: 0.42,
    /** 3D buildings fade in between these zooms. */
    buildingsFrom: [14.6, 15.4] as [number, number],
    buildingOpacity: 0.92,
    /** Buildings without an OSM height get a modest 2–5 floors (varied per building). */
    buildings: { floorM: 3.2, minFloors: 2, maxFloors: 5 },
    /** Night: share (0–100) of buildings that stay dark; lit-window shares of the other three facade types;
     *  warm window tones; facade colour; street-light glow along main roads. */
    lights: {
      darkShare: 38,
      litShares: [0.08, 0.15, 0.24],
      windows: ['#FFC979', '#FFB35C', '#FFE0A3', '#F7A54A', '#FFD7A0'],
      facade: '#3B4253',
      glow: '#FFAE45',
      glowOpacity: 0.34,
      /** Light colour on 3D buildings at night. */
      moonLight: '#E4E8F0',
    },
    /** Street names from this zoom. */
    streetLabelsFrom: 15.4,
    /** Landmark names (towers, bridges) from this zoom. */
    landmarkLabelsFrom: 13.2,
    day: {
      residential: ['#F7DDD3', '#F9E5CA', '#ECE0F1', '#DCEEDD', '#F8EAC4'],
      commercial: '#F8D8C6',
      industrial: '#E9E1D5',
      institutional: '#ECDDF2',
      hospital: '#F8D6DC',
      cemetery: '#CDE2C0',
      pitch: '#B6E2AB',
      grass: '#BEE3A2',
      park: '#B2DD96',
      wood: '#92CB85',
      sand: '#F7E3AA',
      farmland: '#E5ECB7',
      wetland: '#BDE1CF',
      road: '#FFFDF7',
      roadCasing: '#E2D1B8',
      roadMajor: '#F6D489',
      roadMajorCasing: '#D8AC5B',
      path: '#FFFFFF',
      rail: '#CBBDAB',
      buildings: ['#F6EADD', '#F4E2D9', '#F6EBD6', '#F2E6D8', '#F3E0D8', '#E6EADD', '#EAE4EE'],
      landmark: '#F3C468',
      bridge: '#F2BF52',
      streetLabel: '#7A6550',
      streetHalo: '#FFF8EC',
    },
    night: {
      residential: ['#1F222B', '#21232C', '#1E222C', '#1D232A', '#22232B'],
      commercial: '#24242D',
      industrial: '#1C1F26',
      institutional: '#22222D',
      hospital: '#25222C',
      cemetery: '#192322',
      pitch: '#1A2724',
      grass: '#1A2623',
      park: '#192822',
      wood: '#16231F',
      sand: '#2A2824',
      farmland: '#1F241F',
      wetland: '#182427',
      road: '#4D5569',
      roadCasing: '#14171E',
      roadMajor: '#D99A4A',
      roadMajorCasing: '#4A3A22',
      path: '#3A4256',
      rail: '#353B4E',
      buildings: ['#3C4354', '#3E4255', '#3A4253', '#3B4451', '#3F4154', '#3D4353', '#394252'],
      landmark: '#F0BE68',
      bridge: '#FFC870',
      streetLabel: '#D8CFBF',
      streetHalo: '#141A24',
    },
    /** Warm cast over everything at golden hour. */
    goldenTint: '#F4C9A0',
    goldenTintAmount: 0.22,
    /** Vegetation by season (day colours; night palette stays dark). */
    seasons: {
      spring: { grass: '#C4E9A2', park: '#B9E39A', wood: '#9AD38B', blossom: ['#C77DD8', '#F2A6C9', '#E58FB8'] },
      summer: { grass: '#B0DD8B', park: '#A7D886', wood: '#80C274', blossom: [] as string[] },
      autumn: { grass: '#D3DA98', park: '#CBD58C', wood: '#E3B271', blossom: ['#E8692F', '#F2A23A', '#C9472E'] },
      winter: { grass: '#9DC59A', park: '#97C294', wood: '#5C9A78', blossom: [] as string[] },
    },
    /** Spring tulips in Emirgan Korusu (red / yellow / pink / white dots). */
    tulips: ['#E8344A', '#F7C531', '#F57FB0', '#FFFFFF', '#E8344A', '#FF8A3D'],
  },

  shore: {
    highlightWidth: [1, 2] as [number, number],
    innerShadowWidth: [4, 22] as [number, number],
    innerShadowBlur: [4, 20] as [number, number],
    innerShadowOpacity: 0.45,
  },

  piers: {
    radius: [2.5, 7] as [number, number],
    strokeWidth: [1, 2] as [number, number],
    /** Pier names show from this zoom. */
    labelMinZoom: 13.5,
  },

  labels: {
    /** District labels show between these zooms. */
    districtMinZoom: 10.5,
    districtMaxZoom: 15.5,
    fontFamily: "'Nunito', system-ui, sans-serif",
  },

  routes: {
    /** Route lines under the ferries. */
    width: [1.2, 3] as [number, number],
    opacity: 0.45,
    dash: [2, 2] as [number, number],
  },

  ferries: {
    /** Real vapur size (m); the model is drawn this size × exaggeration. */
    lengthM: 70,
    beamM: 14,
    /** Size exaggeration by zoom: ~3–4× at city zoom, real size when zoomed right in. */
    exaggeration: [
      [10, 6.4],
      [11, 5.6],
      [13, 3.9],
      [16, 1.3],
    ] as [number, number][],
    /** Simulated seconds a vessel takes to grow in / shrink out (docked) when entering / leaving service. */
    appearSeconds: 90,
    /** Heading smoothing: time constant (s, real time) of the critically-damped turn. */
    headingTau: 0.35,
    /** Sim seconds to swing alongside after arriving, and out again before departing. */
    dockTurnSeconds: 50,
    /** Route distance (m) over which a vessel eases into its berth slot / quay offset. */
    berthBlendM: 350,
    /** Lines sharing a berth moor abreast: spacing between hulls, in (exaggerated) beams. */
    slotSpacing: 1.25,
    /** Extra seaward clearance for exaggerated hulls at the quay (fraction of exaggerated beam). */
    quayClearance: 0.6,
    /** Real distance of berth points off the coastline (must match scripts/build-piers.ts). */
    berthOffsetM: 30,
    /** Gentle roll/pitch/heave (degrees, seconds, metres at real scale); calmer when docked. */
    bob: { rollDeg: 1.6, rollPeriodS: 5.5, pitchDeg: 0.9, pitchPeriodS: 7.3, heaveM: 0.25, dockedFactor: 0.45, windFactor: 2.2 },
    /** Settle bump on arrival: damped surge + pitch (real seconds). */
    bump: { surgeM: 2.4, pitchDeg: 2.2, periodS: 1.7, decayS: 1.2 },
    /** Soft contact shadow under the hull: size as multiples of (beam, length). */
    shadowScale: [1.9, 1.25] as [number, number],
    shadowColor: '#0B2730',
    shadowOpacity: 0.38,
  },

  water: {
    /** Distance-to-coast texture width (cells) and the distance mapped to "deep" (m). */
    fieldWidth: 768,
    fieldMaxM: 1400,
    /** Warm city-light reflections along the shore at night. */
    cityLight: '#FFB45E',
    /** Sparkle strength by day / golden hour. */
    sparkleDay: 0.5,
    sparkleGolden: 0.5,
  },

  wake: {
    /** Simulated seconds of track the wake covers at real scale (plan: ~20–30 s). */
    seconds: 34,
    /** How much longer the wake gets with hull exaggeration (0 = not at all, 1 = proportional). */
    exagFactor: 0.6,
    /** Trail samples at real scale (spaced seconds/(samples−1) apart); more when exaggerated. */
    samples: 22,
    /** Cap on trail samples per vessel (mesh size = vessels × maxSamples × 3 vertices). */
    maxSamples: 48,
    /** V opening: half-width growth per metre behind the bow. */
    spread: 0.34,
    /** Max wake half-width, in beams. */
    maxWidthBeams: 3.1,
    color: '#F4FBFA',
    opacity: 0.95,
    /** Speed (m/s) that counts as "full" wake. */
    cruiseMs: 6.5,
  },

  selection: {
    /** Unselected ferries are tinted with this while one is selected. */
    dimColor: '#9AA3A8',
    ringScale: 0.62,
    pulseHz: 0.8,
    /** Tap radius around a ferry (CSS px; plan: hit areas ≥ 44 px). */
    hitRadiusPx: 26,
    /** Routes: opacity of unrelated lines while one is selected. */
    routeDimOpacity: 0.12,
  },

  nightLights: {
    windowGlow: '#FFC46B',
    port: '#FF3B30',
    starboard: '#34E07A',
    masthead: '#FFF6E0',
    /** Light sprite size (world metres before exaggeration… sprites are clamped in px). */
    sizeM: 14,
    reflection: '#FFB35C',
    reflectionOpacity: 0.32,
    /** Reflection streak size in hull lengths / beams. */
    reflectionLength: 1.8,
    reflectionWidth: 0.7,
  },

  smoke: {
    puffs: 14,
    lifeS: 9,
    /** Bearing the wind blows towards (poyraz from the NE → towards SW). */
    windToward: 215,
    windMs: 2.2,
    riseMs: 1.6,
    /** How much of the ship's speed the puffs keep astern (0 = left behind at once). */
    sternDrift: 0.55,
    sizeM: 11,
    growM: 7.5,
    alpha: 0.5,
    dockedAlpha: 0.22,
    /** Largest puff on screen (px). */
    maxPx: 220,
    color: '#EEF0F1',
    nightColor: '#5F6670',
  },

  /** Follow mode camera: centre easing (s), slow turn towards the vessel's course (s). */
  follow: { tau: 0.9, bearingTau: 6, rotate: true },

  /** Cinematic, decorative moments (real time): departure horn + smoke burst, arrival splash. */
  moments: {
    hornS: 2.2,
    hornGapS: 0.9,
    hornGrowM: 70,
    hornColor: '#FFD983',
    burstColor: '#8F979E',
    burstS: 9,
    burstPuffs: 10,
    splashS: 1.4,
    splashDrops: 12,
    /** Seconds after departure that gulls prefer this ferry. */
    gullFollowS: 120,
  },

  gulls: {
    count: 9,
    vessels: 3,
    minZoom: 13.2,
    spanM: 9,
    orbitM: 28,
    altitudeM: 22,
    orbitSpeed: 0.55,
    flapHz: 2.6,
    followTau: 2.5,
    color: '#F7F7F2',
  },

  /** Day/night: sun elevation (degrees) breakpoints and per-phase light. */
  daylight: {
    /** Fully "day" above this elevation; golden hour between goldenBelow and 0. */
    dayAbove: 10,
    /** Fully "night" below this elevation (civil twilight ends at −6°). */
    nightBelow: -7,
    /** Light colours/intensities for 3D objects. */
    sunDay: '#FFF1DE',
    sunGolden: '#FFD2A1',
    moon: '#9FB7D9',
    hemiSkyNight: '#5A6E96',
    hemiGroundNight: '#0A1820',
    hemiNight: 0.95,
    sunNight: 0.25,
    /** Re-apply the map palette when it changes by more than this (0–1 blend steps). */
    paletteStep: 0.02,
  },

  /** Lighting for 3D objects (day values; day/night blends from here). */
  light: {
    sky: '#FFFFFF',
    ground: '#2E6A78',
    hemiIntensity: 1.6,
    sun: '#FFF1DE',
    sunIntensity: 1.9,
    /** Compass bearing / elevation (degrees) the light comes from. */
    sunAzimuth: 210,
    sunElevation: 48,
  },

  /** Simulation tunables (pure-function inputs; see src/sim). */
  sim: {
    /** Europe/Istanbul is UTC+3 all year (no DST since 2016). */
    utcOffsetHours: 3,
    /** Ease-in / ease-out duration when leaving / approaching a pier (s). */
    rampSeconds: 60,
    /** Peak windows (Istanbul local time) where headwayPeak applies. */
    peakWindows: [
      ['07:00', '10:00'],
      ['17:00', '20:00'],
    ] as [string, string][],
    /** A vessel entering service appears docked this long before its first departure (min). */
    spawnLeadMin: 6,
    /** After its last arrival a vessel stays docked this long, then leaves service (min). */
    retireAfterMin: 10,
    /** A vessel idle at the origin longer than this leaves service instead of waiting (min). */
    maxLayoverMin: 45,
    /** Speed multipliers offered by the time controls. */
    speeds: [1, 10, 60],
  },

  places: {
    /** Below this zoom only well-known featured pins show (Wikidata / high importance). */
    allPinsZoom: 12.4,
    /** Pins closer than this (CSS px) to a higher-priority pin shrink to dots. */
    declutterPx: 40,
    /** Names under pins from this zoom. */
    labelZoom: 15.2,
    /** Fly-to zoom when opening a place / post. */
    flyZoom: 15.6,
    /** "Near this pier" radius (m) and walking speed (m/min). */
    nearbyM: 900,
    walkMPerMin: 80,
    /** Map POIs (OSM cafés, shops, museums, parks…) fade in from this zoom; names from poiNamesFrom. */
    poiFrom: 14.8,
    poiNamesFrom: 16,
    /** Max OpenMapTiles rank (a per-tile importance order) shown below z16 / z17 / z18, then all. */
    poiRanks: [24, 60, 140] as [number, number, number],
    /** Below z17.4 only POIs up to this rank get a name. */
    poiNameRank: 20,
    /** Featured place names from this zoom. */
    featuredNamesFrom: 13.8,
  },

  weather: {
    /** Open-Meteo (free, no key). Refresh interval in minutes. */
    url: 'https://api.open-meteo.com/v1/forecast?latitude=41.02&longitude=29.0&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation,visibility&wind_speed_unit=ms&timezone=Europe%2FIstanbul',
    refreshMin: 15,
    /** Seconds (real time) for the scene to ease into new conditions. */
    easeS: 4,
    /** Colours the scene drifts towards under each condition (day / night). */
    snowDay: '#F4F7FB',
    snowNight: '#55607A',
    wetRoadDay: '#A9B0B8',
    wetRoadNight: '#4E5A70',
    overcastSky: '#B9C3C9',
    rainSky: '#8E9CA6',
    fogColor: '#E4EAEC',
    fogNight: '#2B3644',
    /** How much each condition changes the look (0–1). */
    snowCover: 0.78,
    wetDarken: 0.14,
    overcastDesat: 0.32,
    /** Rain / snow particles (screen-space quads) at full intensity; scaled by quality tier. */
    rainDrops: 1400,
    snowFlakes: 900,
    /** Rain streak length / width (CSS px) and fall speed (screen heights per second). */
    rainLengthPx: 22,
    rainWidthPx: 1.3,
    rainSpeed: 1.6,
    rainColor: '#DDE8F0',
    rainAlpha: 0.5,
    snowSizePx: 4.5,
    snowSpeed: 0.12,
    /** Fog banks: drifting noise over the map, metres per noise cell and drift speed (m/s). */
    fogCellM: 900,
    fogDriftMs: 9,
    fogAlpha: 0.9,
    /** Ferry fading in fog: distance (m) from the view centre where vessels are fully hidden. */
    fogHideM: 2600,
    /** Lightning flashes during storms: mean seconds between flashes. */
    lightningEveryS: 9,
  },

  /** Place icons: one colour per category (shape carries the category too — see src/places/icons.ts). */
  icons: {
    colors: {
      cafe: '#8A5A3B',
      restaurant: '#E8644A',
      bar: '#8E5BE0',
      bakery: '#D7951A',
      museum: '#2F5DA8',
      gallery: '#2F5DA8',
      theatre: '#D23A3F',
      cinema: '#D23A3F',
      shop: '#13938C',
      park: '#3B9A57',
      viewpoint: '#3B9A57',
      landmark: '#C9971C',
    },
    /** Map POIs (CSS px) and featured places (bigger, pin + glow). */
    poiSize: 22,
    /** Extra collision space around map POIs (px): fewer icons at once. */
    poiPadding: 7,
    featuredSize: 32,
    landmarkSize: 30,
  },

  /** Guide routes on the map. */
  guides: { walkColor: '#C0392B', stopColor: '#E0A100' },

  /** Snapshot share image: aspect (w/h, 4:5 = Instagram feed) and max height in px. */
  snapshot: { aspect: 0.8, maxHeight: 1350, appName: 'Istanbul Living City' },

  /** OpenStreetMap services used from the browser (no keys). */
  osm: {
    nominatim: 'https://nominatim.openstreetmap.org',
    /** Nominatim policy: max 1 request/s — we keep a little margin. */
    minIntervalMs: 1100,
  },

  perf: {
    /** Start resolution cap (device pixels per CSS pixel). */
    maxPixelRatio: 2,
    /** Steps down when fps < minFps for lowForMs. */
    pixelRatioSteps: [1.5, 1.25, 1],
    minFps: 50,
    lowForMs: 3000,
  },

  debug: {
    /** Show the debug panel by default in dev builds (toggle with ?debug=0/1 or the ` key). */
    enabledInDev: true,
    /** FPS sampling window (ms). */
    fpsWindowMs: 500,
    /** Window for the "min fps" reading (ms). */
    fpsMinWindowMs: 5000,
  },
} as const;

export type Palette = { [K in keyof typeof CONFIG.colors.day]: string };
