import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { initialCamera, parseView } from './intro';

describe('?view= initial camera', () => {
  it('reads lng,lat,zoom and optional pitch, bearing', () => {
    expect(parseView('?view=29.02,41.0,14')).toEqual({ center: [29.02, 41.0], zoom: 14, pitch: CONFIG.camera.pitch, bearing: CONFIG.camera.bearing });
    expect(parseView('?t=19:00&view=29,41.02,12.5,0,30')).toEqual({ center: [29, 41.02], zoom: 12.5, pitch: 0, bearing: 30 });
  });
  it('clamps to our box and zoom range; ignores junk', () => {
    expect(parseView('?view=10,10,30')).toMatchObject({ center: [CONFIG.bounds[0], CONFIG.bounds[1]], zoom: CONFIG.camera.maxZoom });
    expect(parseView('?view=a,b,c')).toBeNull();
    expect(parseView('?view=29,41')).toBeNull();
    expect(parseView('')).toBeNull();
  });
  it('wins over the intro camera', () => {
    expect(initialCamera(true, '?view=29,41.02,15').zoom).toBe(15);
    expect(initialCamera(true, '').zoom).toBe(CONFIG.camera.intro.zoom);
  });
});
