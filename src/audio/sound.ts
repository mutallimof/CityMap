import type { Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';

/**
 * Harbour sounds, all synthesised with Web Audio (no recordings): soft waves, the odd seagull, and a
 * ferry horn when a vessel leaves a pier near the view. Off by default; volume follows zoom and distance.
 * iOS: the audio session is "ambient", so the ring/silent switch mutes it. Reduce-motion: waves only,
 * nothing sudden. Paused while the page is hidden.
 */
export class HarbourSound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private waves!: GainNode;
  private echo!: ConvolverNode;
  private on = false;
  private timer = 0;
  private nextGull = 0;

  constructor(
    private map: MlMap,
    private reduced: boolean,
    /** How many seagulls are flying in view (0 = none). */
    private gullsInView: () => number,
  ) {
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.on) void this.ctx.resume();
    });
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Must be called from a tap (browsers only start audio on a user gesture). */
  setEnabled(on: boolean): void {
    this.on = on;
    if (on && !this.ctx) this.start();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? CONFIG.sound.master : 0, t, 0.4);
    if (on) void this.ctx.resume();
    else setTimeout(() => !this.on && void this.ctx?.suspend(), 1500);
  }

  private start(): void {
    // Safari 16.4+: "ambient" = mixes with other audio and obeys the silent switch.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'ambient';
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.echo = ctx.createConvolver();
    this.echo.buffer = this.impulse(2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.echo.connect(wet).connect(this.master);
    this.startWaves();
    this.timer = window.setInterval(() => this.tick(), 500);
  }

  /** Decaying noise = a soft hall / open-water echo for the horn and gulls. */
  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return b;
  }

  /** Brown noise through a low-pass, swelling slowly like waves on a quay. */
  private startWaves(): void {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const swell = ctx.createGain();
    swell.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain).connect(swell.gain);
    this.waves = ctx.createGain();
    this.waves.gain.value = 0;
    src.connect(lp).connect(swell).connect(this.waves).connect(this.master);
    src.start();
    lfo.start();
  }

  /** 0..1 loudness for things at the map centre by zoom (quiet zoomed out, full at street level). */
  private zoomLevel(): number {
    const s = CONFIG.sound;
    return Math.max(0, Math.min(1, (this.map.getZoom() - s.fromZoom) / (s.fullZoom - s.fromZoom)));
  }

  private tick(): void {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    this.waves.gain.setTargetAtTime(CONFIG.sound.waves * (0.25 + 0.75 * this.zoomLevel()), t, 1.5);
    if (this.reduced) return;
    const now = performance.now();
    if (now > this.nextGull) {
      const n = this.gullsInView();
      if (n > 0 && this.zoomLevel() > 0.3) this.gull(Math.min(1, n / 4) * this.zoomLevel());
      this.nextGull = now + 7000 + Math.random() * 12000;
    }
  }

  /** "Kee-ow": a few falling squeals with a rough edge, through a band-pass. */
  private gull(level: number): void {
    const ctx = this.ctx!;
    const calls = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < calls; k++) {
      const t0 = ctx.currentTime + k * (0.28 + Math.random() * 0.12);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f0 = 1500 + Math.random() * 350;
      o.frequency.setValueAtTime(f0 * 0.82, t0);
      o.frequency.linearRampToValueAtTime(f0, t0 + 0.05);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t0 + 0.24);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1700;
      bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(CONFIG.sound.gull * level, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
      o.connect(bp).connect(g);
      g.connect(this.master);
      g.connect(this.echo);
      o.start(t0);
      o.stop(t0 + 0.3);
    }
  }

  /** Ferry horn for a departure at `lngLat`, if it's near the view; louder close in and zoomed in. */
  departure(lngLat: [number, number]): void {
    if (!this.ctx || !this.on || this.reduced) return;
    const c = this.map.getCenter();
    const dM = Math.hypot((lngLat[0] - c.lng) * 111_320 * Math.cos((c.lat * Math.PI) / 180), (lngLat[1] - c.lat) * 110_540);
    const viewM = CONFIG.sound.hearM * 2 ** (13 - this.map.getZoom());
    const near = 1 - dM / viewM;
    if (near <= 0) return;
    this.horn(CONFIG.sound.horn * near * (0.35 + 0.65 * this.zoomLevel()));
  }

  /** Two low, slightly detuned reeds with a soft attack — the classic vapur "düüt". */
  private horn(level: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.05;
    const len = CONFIG.sound.hornS;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + 0.18);
    g.gain.setValueAtTime(level, t0 + len - 0.35);
    g.gain.linearRampToValueAtTime(0, t0 + len);
    for (const [f, type] of [
      [138.6, 'sawtooth'],
      [139.4, 'sawtooth'],
      [207.7, 'square'],
    ] as [number, OscillatorType][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * 0.97, t0);
      o.frequency.linearRampToValueAtTime(f, t0 + 0.25);
      const og = ctx.createGain();
      og.gain.value = type === 'square' ? 0.18 : 0.4;
      o.connect(og).connect(lp);
      o.start(t0);
      o.stop(t0 + len + 0.1);
    }
    lp.connect(g);
    g.connect(this.master);
    g.connect(this.echo);
  }

  dispose(): void {
    clearInterval(this.timer);
    void this.ctx?.close();
  }
}
