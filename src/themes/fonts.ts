/**
 * Map label fonts of the themes (style `font-faces`, MapLibre draws them locally with TinySDF). Files are
 * OFL fonts from @fontsource packages, bundled with the site (self-hosted) and only downloaded when a label
 * in that font is drawn. Credits: CLAUDE.md "Fonts".
 *   Toy Rounded      — Fredoka SemiBold (OFL 1.1)
 *   Storybook Hand   — Patrick Hand (OFL 1.1)
 *   Storybook Serif  — Fraunces SemiBold (OFL 1.1)
 */
import type { FontFacesSpecification } from 'maplibre-gl';
import fredokaLatin from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2?url';
import fredokaExt from '@fontsource/fredoka/files/fredoka-latin-ext-600-normal.woff2?url';
import handLatin from '@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2?url';
import handExt from '@fontsource/patrick-hand/files/patrick-hand-latin-ext-400-normal.woff2?url';
import serifLatin from '@fontsource/fraunces/files/fraunces-latin-600-normal.woff2?url';
import serifExt from '@fontsource/fraunces/files/fraunces-latin-ext-600-normal.woff2?url';

// fontsource's unicode ranges (same for every family): Latin, Latin Extended (Turkish ğ ş ı İ live here).
const LATIN = ['U+0000-00FF', 'U+0131', 'U+0152-0153', 'U+02BB-02BC', 'U+02C6', 'U+02DA', 'U+02DC', 'U+0304', 'U+0308', 'U+0329', 'U+2000-206F', 'U+20AC', 'U+2122', 'U+2191', 'U+2193', 'U+2212', 'U+2215', 'U+FEFF', 'U+FFFD'];
// + combining marks (U+0300–036F): never ask the glyph server for a stack it doesn't have.
const LATIN_EXT = ['U+0300-036F', 'U+0100-02BA', 'U+02BD-02C5', 'U+02C7-02CC', 'U+02CE-02D7', 'U+02DD-02FF', 'U+0304', 'U+0308', 'U+0329', 'U+1D00-1DBF', 'U+1E00-1E9F', 'U+1EF2-1EFF', 'U+2020', 'U+20A0-20AB', 'U+20AD-20C0', 'U+2113', 'U+2C60-2C7F', 'U+A720-A7FF'];

const pair = (latin: string, ext: string) => [
  { url: latin, 'unicode-range': LATIN },
  { url: ext, 'unicode-range': LATIN_EXT },
];

export const MAP_FONT_FACES: FontFacesSpecification = {
  'Toy Rounded': pair(fredokaLatin, fredokaExt),
  'Storybook Hand': pair(handLatin, handExt),
  'Storybook Serif': pair(serifLatin, serifExt),
};
