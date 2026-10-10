import { describe, expect, it } from 'vitest';
import { lookupId, osmFromTileId } from './nominatim';

describe('osm ids', () => {
  it('converts tile ids and lookup ids', () => {
    expect(osmFromTileId(50860610841)).toBe('node/5086061084');
    expect(osmFromTileId(232367832)).toBe('way/23236783');
    expect(osmFromTileId(44297963)).toBe('relation/4429796');
    expect(osmFromTileId(15588050)).toBeNull();
    expect(lookupId('way/23236783')).toBe('W23236783');
    expect(lookupId('nonsense')).toBeNull();
  });
});
