import { beforeEach, describe, expect, it, vi } from 'vitest';

const nominatim = vi.fn();
vi.mock('../osm/nominatim', () => ({ nominatim: (...a: unknown[]) => nominatim(...a) }));
import { osmSearch } from './osm';

const row = (id: number, name: string) => ({ osm_type: 'node', osm_id: id, lat: '41.0', lon: '29.0', name, display_name: `${name}, Kadıköy, İstanbul`, category: 'amenity', type: 'cafe', boundingbox: ['40.9', '41.1', '28.9', '29.1'] });

describe('osmSearch', () => {
  beforeEach(() => nominatim.mockReset());
  it('returns null when search is unreachable (distinct from no results)', async () => {
    nominatim.mockResolvedValue(null);
    expect(await osmSearch('cafe')).toBeNull();
  });
  it('returns an empty list when reached but nothing found', async () => {
    nominatim.mockResolvedValue([]);
    expect(await osmSearch('zzzz')).toEqual([]);
  });
  it('maps results', async () => {
    nominatim.mockResolvedValue([row(1, 'A'), row(2, 'B')]);
    const r = await osmSearch('cafe');
    expect(r?.map((x) => x.id)).toEqual(['osm:node/1', 'osm:node/2']);
  });
});
