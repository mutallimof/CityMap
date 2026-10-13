/**
 * Places the planner can't connect by walking or by our ferries: islets with their own boat only
 * (Kız Kulesi). The list is `data/catalog/no-walk.json` (id / OSM element / name, no coordinates);
 * names are matched too because a place tapped on the map has no curated id. Islands WITH a pier of
 * ours (Adalar) are not on it: their ferry connection is real. Pure.
 */
import catalog from '../../data/catalog/no-walk.json';

interface Entry {
  id: string;
  osm?: string;
  names: string[];
}

const fold = (s: string) => s.normalize('NFD').replace(/\u0307/g, '').toLowerCase().replace(/ı/g, 'i').normalize('NFC').replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim();

export function makeIsletCheck(entries: Entry[]): (p: { id?: string; osm?: string | null; name?: string; nameEn?: string | null }) => boolean {
  const ids = new Set(entries.map((e) => e.id));
  const osm = new Set(entries.flatMap((e) => (e.osm ? [e.osm] : [])));
  const names = new Set(entries.flatMap((e) => e.names.map(fold)));
  return (p) => !!((p.id && ids.has(p.id)) || (p.osm && osm.has(p.osm)) || (p.name && names.has(fold(p.name))) || (p.nameEn && names.has(fold(p.nameEn))));
}

/** True for a place that needs its own boat (no walk, no ferry connection from the planner). */
export const isIslet = makeIsletCheck((catalog as { places: Entry[] }).places);
