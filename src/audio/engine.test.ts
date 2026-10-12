import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_FILES, BED_FILES } from './assets';
import { CitySound, type SoundDeps, type SoundInputs } from './engine';
import type { MixInput } from './mix';

/** Just enough of Web Audio for the engine to run headless. */
function fakeContext() {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => {
    const n = { gain: param(), frequency: param(), Q: param(), pan: param(), playbackRate: param(), type: '', buffer: null as unknown, onended: null as unknown };
    return Object.assign(n, { connect: (x: unknown) => x, disconnect() {}, start: vi.fn(), stop() {} });
  };
  return {
    currentTime: 0,
    destination: node(),
    createGain: node,
    createBiquadFilter: node,
    createStereoPanner: node,
    createBufferSource: node,
    decodeAudioData: vi.fn(async () => ({ duration: 66 })),
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}

const quietDay: MixInput = { night: 0, zoom: 16, water: 0.8, rain: 0, snow: 0, fog: 0, thunder: 0, windMs: 2 };

function setup(input: MixInput = quietDay) {
  const ctx = fakeContext();
  const deps: SoundDeps = {
    createContext: vi.fn(() => ctx as unknown as AudioContext),
    load: vi.fn(async () => new ArrayBuffer(8)),
    canPlay: () => 'probably',
  };
  const inputs: SoundInputs = { mixInput: () => input, zoom: () => input.zoom, distanceTo: () => 100, reduced: false };
  return { ctx, deps, sound: new CitySound(inputs, deps) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('document', { hidden: false, addEventListener() {} });
  vi.stubGlobal('window', globalThis);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('city sound engine', () => {
  it('creates no audio context and fetches nothing while sound is off', async () => {
    const { deps, sound } = setup();
    sound.departure([29, 41], true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.createContext).not.toHaveBeenCalled();
    expect(deps.load).not.toHaveBeenCalled();
    expect(sound.enabled).toBe(false);
  });

  it('loads only what the current mix needs once switched on', async () => {
    const { deps, sound } = setup();
    sound.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.createContext).toHaveBeenCalledTimes(1);
    const files = vi.mocked(deps.load).mock.calls.map((c) => c[0]);
    // Day by the water, close in: harbour + water + hum beds and gull clips — no rain, wind, fog signal.
    expect(files).toContain(`${BED_FILES.harbour}.webm`);
    expect(files.some((f) => f.startsWith('rain.') || f.startsWith('wind.') || f.startsWith('foghorn.'))).toBe(false);
    for (const f of files) expect(ALL_FILES).toContain(f.replace(/\.(webm|m4a)$/, ''));
  });

  it('falls back to AAC when Opus does not decode (iOS)', async () => {
    const { ctx, deps, sound } = setup();
    ctx.decodeAudioData.mockRejectedValueOnce(new Error('no opus'));
    sound.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1500);
    const files = vi.mocked(deps.load).mock.calls.map((c) => c[0]);
    expect(files.some((f) => f.endsWith('.m4a'))).toBe(true);
  });

  it('turning it off again stops fetching', async () => {
    const { deps, sound } = setup();
    sound.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1000);
    sound.setEnabled(false);
    const n = vi.mocked(deps.load).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(vi.mocked(deps.load).mock.calls.length).toBe(n);
  });
});
