import type { BedId } from './mix';

/**
 * Files in `public/audio` (built by `npm run data:audio` from `data/catalog/sounds.json`; sources, authors and
 * licences in CLAUDE.md and `audio/credits.html`). Each name exists as `.webm` (Opus) and `.m4a` (AAC).
 */
export const BED_FILES: Record<BedId, string> = {
  harbour: 'harbour',
  water: 'water',
  hum: 'hum',
  street: 'street',
  rain: 'rain',
  wind: 'wind',
};

export type ShotKind = 'gull' | 'bell' | 'foghorn' | 'pier' | 'horn';

export const SHOT_FILES: Record<ShotKind, readonly string[]> = {
  gull: ['gull-1', 'gull-2', 'gull-3', 'gull-4', 'gull-5'],
  bell: ['bell'],
  foghorn: ['foghorn'],
  pier: ['pier'],
  horn: ['horn'],
};

/** Every file the engine may fetch. */
export const ALL_FILES = [...Object.values(BED_FILES), ...Object.values(SHOT_FILES).flat()];
