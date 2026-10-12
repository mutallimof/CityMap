import { CONFIG } from '../config';
import { BED_FILES, SHOT_FILES, type ShotKind } from './assets';
import { BEDS, HornGate, mixFor, nextGapS, type BedId, type Mix, type MixInput } from './mix';

/** What the engine needs from the browser (injected so tests can check nothing loads while sound is off). */
export interface SoundDeps {
  createContext(): AudioContext;
  /** Bytes of a file under the audio folder (e.g. "harbour.webm"). */
  load(file: string): Promise<ArrayBuffer>;
  /** `HTMLMediaElement.canPlayType`. */
  canPlay(type: string): string;
}

export interface SoundInputs {
  /** The scene right now (sun, zoom, water around the view, weather). */
  mixInput(): MixInput;
  zoom(): number;
  /** Metres from the view centre to a point. */
  distanceTo(lngLat: [number, number]): number;
  reduced: boolean;
}

export const browserDeps = (base: string): SoundDeps => ({
  createContext: () => {
    // Safari 16.4+: "ambient" = mixes with other audio and obeys the ring/silent switch.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'ambient';
    try {
      return new AudioContext({ sampleRate: CONFIG.sound.sampleRate, latencyHint: 'playback' });
    } catch {
      return new AudioContext();
    }
  },
  load: async (file) => {
    const r = await fetch(base + file);
    if (!r.ok) throw new Error(`${file}: ${r.status}`);
    return r.arrayBuffer();
  },
  canPlay: (type) => document.createElement('audio').canPlayType(type),
});

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** Decoded files, fetched on first use. Opus (WebM) where the browser says it plays it, AAC (.m4a) otherwise / on decode failure. */
class Bank {
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private ext: 'webm' | 'm4a';

  constructor(
    private ctx: AudioContext,
    private deps: SoundDeps,
  ) {
    this.ext = deps.canPlay('audio/webm; codecs="opus"') === 'probably' ? 'webm' : 'm4a';
  }

  get(name: string): AudioBuffer | null {
    const b = this.buffers.get(name);
    if (b) return b;
    if (!this.pending.has(name)) this.pending.set(name, this.fetch(name));
    return null;
  }

  /** Forget a decoded file (fetched again when next needed); loads in flight are left alone. */
  drop(name: string): void {
    if (this.buffers.delete(name)) this.pending.delete(name);
  }

  private async fetch(name: string): Promise<AudioBuffer | null> {
    for (const ext of this.ext === 'webm' ? (['webm', 'm4a'] as const) : (['m4a'] as const)) {
      try {
        const buf = await this.ctx.decodeAudioData(await this.deps.load(`${name}.${ext}`));
        this.buffers.set(name, buf);
        return buf;
      } catch (e) {
        if (ext === 'webm') this.ext = 'm4a';
        else console.warn('sound:', name, e);
      }
    }
    return null;
  }
}

/**
 * One ambience bed: random stretches of a long recording, crossfaded, in two voices panned apart (so the
 * same seconds never line up into an audible loop). Silent beds stop playing; long-silent ones are unloaded.
 */
class Bed {
  readonly out: GainNode;
  private voices: { nextAt: number; pan: number; src: AudioBufferSourceNode | null }[];
  private silentSince = -Infinity;
  private level = 0;

  constructor(
    private ctx: AudioContext,
    private bank: Bank,
    private file: string,
    bus: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(bus);
    const p = CONFIG.sound.bedPan;
    this.voices = [
      { nextAt: 0, pan: -p, src: null },
      { nextAt: 0, pan: p, src: null },
    ];
  }

  update(level: number, now: number): void {
    const s = CONFIG.sound;
    this.out.gain.setTargetAtTime(level, now, s.fadeS);
    if (level > 0.002) this.silentSince = now;
    const active = level > 0.002 || this.level > 0.002 || now - this.silentSince < s.fadeS * 4;
    this.level = level;
    if (!active) {
      this.stop();
      if (now - this.silentSince > s.unloadAfterS) this.bank.drop(this.file);
      return;
    }
    const buf = this.bank.get(this.file);
    if (!buf) return;
    for (const [k, v] of this.voices.entries()) {
      if (v.nextAt === 0) v.nextAt = now + 0.05 + k * rand(2, 8); // second voice joins a little later
      if (now < v.nextAt - 1) continue;
      v.nextAt = this.segment(buf, Math.max(now, v.nextAt), v);
    }
  }

  /** Schedule one crossfaded stretch from a random offset; returns when the next one should start. */
  private segment(buf: AudioBuffer, t0: number, v: { pan: number; src: AudioBufferSourceNode | null }): number {
    const s = CONFIG.sound;
    const len = Math.min(rand(s.bedSegS[0], s.bedSegS[1]), buf.duration - 0.05);
    const xf = Math.min(s.bedXfadeS, len / 3);
    const offset = Math.random() * Math.max(0, buf.duration - len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(1, t0 + xf);
    g.gain.setValueAtTime(1, t0 + len - xf);
    g.gain.linearRampToValueAtTime(0, t0 + len);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = v.pan;
    src.connect(g).connect(pan).connect(this.out);
    src.start(t0, offset, len);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      pan.disconnect();
      if (v.src === src) v.src = null;
    };
    v.src = src;
    return t0 + len - xf;
  }

  stop(): void {
    for (const v of this.voices) {
      try {
        v.src?.stop();
      } catch {
        /* not started yet */
      }
      v.src = null;
      v.nextAt = 0;
    }
  }
}

/**
 * Istanbul by the water, from real recordings (see CLAUDE.md for sources and licences): ambience beds by
 * time of day, zoom/place and weather (`mixFor`), random gulls / bells / fog signals on top, and a ferry horn
 * for real departures near the view (≤ 1 per `hornGapS`). Off by default; nothing is created or fetched until
 * it is switched on. iOS: "ambient" audio session (silent switch mutes it). Paused while the page is hidden.
 * Reduce-motion: beds only, nothing sudden.
 */
export class CitySound {
  private ctx: AudioContext | null = null;
  private bank!: Bank;
  private master!: GainNode;
  private lowpass!: BiquadFilterNode;
  private shots!: GainNode;
  private beds = new Map<BedId, Bed>();
  private next: Record<ShotKind, number> = { gull: Infinity, bell: Infinity, foghorn: Infinity, pier: Infinity, horn: Infinity };
  private gate = new HornGate();
  private timer = 0;
  private on = false;
  /** Latest mix (for the debug panel / tests). */
  mix: Mix | null = null;

  constructor(
    private inputs: SoundInputs,
    private deps: SoundDeps,
  ) {
    document.addEventListener('visibilitychange', () => this.sync());
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Call from a tap the first time (browsers only start audio on a user gesture). */
  setEnabled(on: boolean): void {
    this.on = on;
    if (on && !this.ctx) this.start();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? CONFIG.sound.master : 0, t, 0.5);
    this.sync();
  }

  /** A vessel left a pier at `lngLat`; `real` = a printed (timetabled) departure. */
  departure(lngLat: [number, number], real: boolean): void {
    if (!this.ctx || !this.on || this.inputs.reduced || document.hidden) return;
    const level = this.gate.level(real, this.inputs.distanceTo(lngLat), this.inputs.zoom(), this.ctx.currentTime);
    if (level > 0) this.shot('horn', level * CONFIG.sound.horn, 0.2);
  }

  private start(): void {
    const ctx = this.deps.createContext();
    this.ctx = ctx;
    this.bank = new Bank(ctx, this.deps);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = CONFIG.sound.openHz;
    this.lowpass.Q.value = 0.5;
    this.lowpass.connect(this.master);
    this.shots = ctx.createGain();
    this.shots.connect(this.lowpass);
    for (const id of BEDS) this.beds.set(id, new Bed(ctx, this.bank, BED_FILES[id], this.lowpass));
  }

  /** Run while on and visible; suspend the context otherwise (no CPU, no battery). */
  private sync(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const run = this.on && !document.hidden;
    if (run) {
      void ctx.resume();
      if (!this.timer) {
        this.timer = window.setInterval(() => this.tick(), 500);
        this.tick();
      }
    } else {
      clearInterval(this.timer);
      this.timer = 0;
      if (document.hidden) void ctx.suspend();
      else
        setTimeout(() => {
          if (!this.on) {
            for (const b of this.beds.values()) b.stop();
            void ctx.suspend();
          }
        }, 1500);
    }
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.on) return;
    const now = ctx.currentTime;
    const m = mixFor(this.inputs.mixInput());
    this.mix = m;
    for (const [id, bed] of this.beds) bed.update(m.beds[id], now);
    this.lowpass.frequency.setTargetAtTime(m.lowpassHz, now, CONFIG.sound.fadeS);
    if (this.inputs.reduced) return;
    const s = CONFIG.sound;
    const streams: [ShotKind, number, number][] = [
      ['gull', m.gullsPerMin, s.gull],
      ['bell', m.bellsPerMin, s.bell],
      ['foghorn', m.foghornsPerMin, s.foghorn],
      ['pier', m.piersPerMin, s.pier],
    ];
    for (const [kind, rate, vol] of streams) {
      if (rate <= 0) {
        this.next[kind] = Infinity;
        continue;
      }
      // Warm the clips up as soon as a stream may fire, so the first one isn't skipped.
      for (const f of SHOT_FILES[kind]) this.bank.get(f);
      if (this.next[kind] === Infinity) this.next[kind] = now + nextGapS(rate, Math.random(), s.oneShotMinGapS);
      else if (now >= this.next[kind]) {
        this.shot(kind, vol * m.oneShotLevel * rand(0.4, 1), 0.7);
        this.next[kind] = now + nextGapS(rate, Math.random(), s.oneShotMinGapS);
      }
    }
  }

  /** One recording at a random pitch nudge, pan and (for long clips) a random window of it. */
  private shot(kind: ShotKind, level: number, panSpread: number): void {
    const ctx = this.ctx!;
    const buf = this.bank.get(pick(SHOT_FILES[kind]));
    if (!buf) return;
    const t0 = ctx.currentTime + 0.05;
    const len = (kind === 'gull' || kind === 'pier') && buf.duration > 8 ? rand(3, 7) : buf.duration;
    const offset = Math.random() * (buf.duration - len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = kind === 'horn' || kind === 'foghorn' ? rand(0.97, 1.03) : rand(0.92, 1.08);
    const g = ctx.createGain();
    const fade = Math.min(0.25, len / 4);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + fade);
    g.gain.setValueAtTime(level, t0 + len - fade);
    g.gain.linearRampToValueAtTime(0, t0 + len);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-panSpread, panSpread);
    src.connect(g).connect(pan).connect(this.shots);
    src.start(t0, offset, len);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      pan.disconnect();
    };
  }

  dispose(): void {
    clearInterval(this.timer);
    void this.ctx?.close();
  }
}
