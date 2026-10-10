import { describe, expect, it } from 'vitest';
import { cropFor } from './snapshot';

describe('snapshot crop', () => {
  it('crops a tall phone frame to 4:5, centred', () => {
    expect(cropFor(780, 1688, 0.8)).toEqual({ x: 0, y: 357, w: 780, h: 975 });
  });
  it('crops a wide frame horizontally', () => {
    expect(cropFor(2000, 1000, 0.8)).toEqual({ x: 600, y: 0, w: 800, h: 1000 });
  });
});
