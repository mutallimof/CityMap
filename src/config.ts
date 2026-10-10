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
    zoom: 12.6,
    pitch: 50,
    bearing: -18,
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
    night: {
      water: '#0E2B36',
      waterShallow: '#174452',
      land: '#1E2430',
      shoreHighlight: '#3A4458',
      landInnerShadow: '#0F131B',
      sky: '#0B1424',
      horizon: '#1A2A3C',
      fog: '#122030',
    },
    accentGold: '#E0A100',
    sunsetCoral: '#F08A5D',
    pier: '#FFFFFF',
    pierStroke: '#1F5E6E',
    labelText: '#5A4B3A',
    labelHalo: 'rgba(243, 233, 215, 0.85)',
  },

  shore: {
    /** Shallow band width in px at z10 and z16 (interpolated). */
    shallowWidth: [6, 60] as [number, number],
    shallowBlur: [6, 50] as [number, number],
    shallowOpacity: 0.55,
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
      [11, 4],
      [13, 3],
      [16, 1],
    ] as [number, number][],
    /** Simulated seconds a vessel takes to grow in / shrink out (docked) when entering / leaving service. */
    appearSeconds: 90,
    /** Heading smoothing: time constant (s, real time) of the critically-damped turn. */
    headingTau: 0.35,
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
