import { describe, expect, it } from 'vitest';
import { stressInputs } from './stress';
import { buildDaySchedule } from './schedule';
import { cachedDays, vesselsAt } from './state';
import { MULTI, SHUTTLE } from './fixtures';

describe('stressInputs', () => {
  it('finds a headway that puts at least N vessels on the water, even at night', () => {
    const at = { day: 20_000, seconds: 3 * 3600 };
    const { inputs, headway } = stressInputs([SHUTTLE, MULTI], 12, at);
    expect(headway).toBeGreaterThanOrEqual(2);
    const getDay = cachedDays((d) => buildDaySchedule(inputs, d));
    expect(vesselsAt(getDay, at).length).toBeGreaterThanOrEqual(12);
  });
});
