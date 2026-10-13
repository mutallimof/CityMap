/**
 * Where a departure's "→ destination" comes from. In Şehir Hatları' winter 2026-27 PDF the row tables
 * (Kabataş – Adalar, Rumeli Kavağı – Eminönü, Anadolu Kavağı – Üsküdar, Boğaz tours) are printed one
 * direction per table, titled "A - B", with the piers in column order and the end pier under
 * VARIŞ; the two-pier Kadıköy – Beşiktaş day table has only one other pier to go to. The "cycle"
 * tables (Kadıköy – Karaköy – Eminönü p. 4, Üsküdar – Karaköy – Eminönü p. 5, the night Kadıköy –
 * Karaköy – Beşiktaş p. 6) print only departure times per pier column: which pier a Karaköy / Eminönü /
 * Beşiktaş departure sails to is our reading of the line route (rules.ts), not printed. Those
 * departures get a "direction inferred" note on the pier board. Simulated departures carry no
 * printed claim at all (the "Simulated schedule" label covers them). Pure.
 */
import type { Departure } from './types';

/** Trip id prefixes (data/timetables.json) of the cycle tables. */
export const INFERRED_DIRECTION_TRIPS = ['kadikoy-karakoy-eminonu:', 'uskudar-karakoy-eminonu:', 'kadikoy-karakoy-besiktas-night:'];

/** Trip id prefixes whose direction the PDF prints (table title + column order) or that have one possible way. */
export const PRINTED_DIRECTION_TRIPS = [
  'kadikoy-besiktas:',
  'kabatas-adalar-',
  'rumeli-kavagi-eminonu:',
  'eminonu-rumeli-kavagi:',
  'anadolu-kavagi-uskudar:',
  'uskudar-anadolu-kavagi:',
  'uzun-bogaz-',
];

/** True for a printed (real) departure whose destination we inferred from the line route. */
export function directionInferred(d: Pick<Departure, 'tripId' | 'real'>): boolean {
  return d.real && INFERRED_DIRECTION_TRIPS.some((p) => d.tripId.startsWith(p));
}
