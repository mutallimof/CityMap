import { CONFIG } from '../config';

/**
 * One icon family for every place on the map, in lists and in the legend: a coloured shape with
 * a simple white glyph. Category is carried by colour AND shape (colour-blind friendly):
 *   food & drink → circle · culture → rounded square · shops → hexagon · nature → leaf · landmark → star
 * Drawn on canvas at runtime (no sprite sheet, crisp at any device pixel ratio).
 */
export type IconKind = 'cafe' | 'restaurant' | 'bar' | 'bakery' | 'museum' | 'gallery' | 'theatre' | 'cinema' | 'shop' | 'park' | 'viewpoint' | 'landmark';
export type Shape = 'circle' | 'square' | 'hex' | 'leaf' | 'star';

export const ICON_KINDS: IconKind[] = ['cafe', 'restaurant', 'bar', 'bakery', 'museum', 'gallery', 'theatre', 'cinema', 'shop', 'park', 'viewpoint', 'landmark'];

export const SHAPE: Record<IconKind, Shape> = {
  cafe: 'circle',
  restaurant: 'circle',
  bar: 'circle',
  bakery: 'circle',
  museum: 'square',
  gallery: 'square',
  theatre: 'square',
  cinema: 'square',
  shop: 'hex',
  park: 'leaf',
  viewpoint: 'leaf',
  landmark: 'star',
};

export const color = (k: IconKind): string => CONFIG.icons.colors[k];

/** OpenMapTiles poi class/subclass → icon kind (only places useful to visitors and locals). */
export const POI_KINDS: Record<string, IconKind> = {
  'cafe/cafe': 'cafe',
  'restaurant/restaurant': 'restaurant',
  'bar/bar': 'bar',
  'bar/nightclub': 'bar',
  'beer/pub': 'bar',
  'bakery/bakery': 'bakery',
  'shop/confectionery': 'bakery',
  'museum/museum': 'museum',
  'art_gallery/gallery': 'gallery',
  'art_gallery/art': 'gallery',
  'art_gallery/arts_centre': 'gallery',
  'theatre/theatre': 'theatre',
  'cinema/cinema': 'cinema',
  'shop/mall': 'shop',
  'grocery/department_store': 'shop',
  'grocery/marketplace': 'shop',
  'park/park': 'park',
  'garden/garden': 'park',
  'attraction/viewpoint': 'viewpoint',
  'attraction/attraction': 'landmark',
  'monument/monument': 'landmark',
  'castle/castle': 'landmark',
  'castle/ruins': 'landmark',
};

/** Featured place `kind` (from build-places) → icon kind. */
export function kindOfPlace(kind: string, category: string): IconKind {
  const k: Record<string, IconKind> = {
    cafe: 'cafe',
    restaurant: 'restaurant',
    fast_food: 'restaurant',
    bar: 'bar',
    pub: 'bar',
    nightclub: 'bar',
    bakery: 'bakery',
    confectionery: 'bakery',
    museum: 'museum',
    gallery: 'gallery',
    art_gallery: 'gallery',
    arts_centre: 'gallery',
    theatre: 'theatre',
    concert_hall: 'theatre',
    venue: 'theatre',
    cinema: 'cinema',
    mall: 'shop',
    bazaar: 'shop',
    marketplace: 'shop',
    department_store: 'shop',
    park: 'park',
    garden: 'park',
    viewpoint: 'viewpoint',
    attraction: 'landmark',
    monument: 'landmark',
    castle: 'landmark',
    ruins: 'landmark',
  };
  return k[kind] ?? ({ food: 'restaurant', culture: 'museum', shopping: 'shop', park: 'park', view: 'viewpoint' } as Record<string, IconKind>)[category] ?? 'landmark';
}

/* ---------------- drawing ---------------- */

type G = CanvasRenderingContext2D;

function shapePath(g: G, shape: Shape, cx: number, cy: number, r: number): void {
  g.beginPath();
  switch (shape) {
    case 'circle':
      g.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case 'square': {
      const s = r * 0.9;
      g.roundRect(cx - s, cy - s, s * 2, s * 2, s * 0.42);
      break;
    }
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const x = cx + r * 1.04 * Math.cos(a);
        const y = cy + r * 1.04 * Math.sin(a);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
      break;
    case 'leaf':
      // Rounded square with one sharp corner (top-right), like a leaf.
      g.moveTo(cx - r, cy);
      g.arcTo(cx - r, cy + r, cx, cy + r, r);
      g.arcTo(cx + r, cy + r, cx + r, cy, r);
      g.lineTo(cx + r, cy - r);
      g.lineTo(cx, cy - r);
      g.arcTo(cx - r, cy - r, cx - r, cy, r);
      g.closePath();
      break;
    case 'star': {
      const pts = 8;
      for (let i = 0; i < pts * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / pts;
        const rr = i % 2 ? r * 0.8 : r * 1.12;
        const x = cx + rr * Math.cos(a);
        const y = cy + rr * Math.sin(a);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
      break;
    }
  }
}

/** White glyph centred at (cx, cy), roughly `s` px tall; `bg` is used for cut-outs. */
export function drawGlyph(g: G, k: IconKind, cx: number, cy: number, s: number, bg: string): void {
  const lw = s * 0.12;
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = g.fillStyle = '#FFFFFF';
  g.lineWidth = lw;
  g.lineCap = g.lineJoin = 'round';
  const u = s / 2;
  const P = (f: () => void, fill = false) => {
    g.beginPath();
    f();
    if (fill) g.fill();
    else g.stroke();
  };
  switch (k) {
    case 'cafe': // cup with handle + steam
      P(() => {
        g.moveTo(-u * 0.75, -u * 0.1);
        g.lineTo(u * 0.45, -u * 0.1);
        g.lineTo(u * 0.3, u * 0.7);
        g.lineTo(-u * 0.6, u * 0.7);
        g.closePath();
      }, true);
      P(() => g.arc(u * 0.5, u * 0.22, u * 0.25, -Math.PI / 2, Math.PI / 2));
      P(() => {
        g.moveTo(-u * 0.3, -u * 0.38);
        g.quadraticCurveTo(-u * 0.5, -u * 0.6, -u * 0.3, -u * 0.85);
        g.moveTo(u * 0.05, -u * 0.38);
        g.quadraticCurveTo(-u * 0.15, -u * 0.6, u * 0.05, -u * 0.85);
      });
      break;
    case 'restaurant': // fork + knife
      P(() => {
        g.moveTo(-u * 0.4, -u * 0.8);
        g.lineTo(-u * 0.4, u * 0.85);
        g.moveTo(-u * 0.7, -u * 0.8);
        g.lineTo(-u * 0.7, -u * 0.2);
        g.quadraticCurveTo(-u * 0.7, u * 0.05, -u * 0.4, u * 0.05);
        g.quadraticCurveTo(-u * 0.1, u * 0.05, -u * 0.1, -u * 0.2);
        g.lineTo(-u * 0.1, -u * 0.8);
      });
      P(() => {
        g.moveTo(u * 0.45, u * 0.85);
        g.lineTo(u * 0.45, -u * 0.8);
        g.quadraticCurveTo(u * 0.85, -u * 0.5, u * 0.75, u * 0.1);
        g.lineTo(u * 0.45, u * 0.1);
      });
      break;
    case 'bar': // cocktail glass
      P(() => {
        g.moveTo(-u * 0.8, -u * 0.7);
        g.lineTo(u * 0.8, -u * 0.7);
        g.lineTo(0, u * 0.15);
        g.closePath();
      }, true);
      P(() => {
        g.moveTo(0, u * 0.15);
        g.lineTo(0, u * 0.75);
        g.moveTo(-u * 0.4, u * 0.8);
        g.lineTo(u * 0.4, u * 0.8);
      });
      break;
    case 'bakery': // simit: thick ring with sesame
      g.lineWidth = s * 0.26;
      P(() => g.arc(0, 0, u * 0.55, 0, Math.PI * 2));
      g.fillStyle = bg;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.3;
        g.beginPath();
        g.arc(Math.cos(a) * u * 0.55, Math.sin(a) * u * 0.55, s * 0.035, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'museum': // pediment + columns
      P(() => {
        g.moveTo(-u * 0.9, -u * 0.35);
        g.lineTo(0, -u * 0.9);
        g.lineTo(u * 0.9, -u * 0.35);
        g.closePath();
      }, true);
      for (const x of [-0.6, -0.2, 0.2, 0.6]) g.fillRect(x * u - lw / 2, -u * 0.22, lw, u * 0.82);
      g.fillRect(-u * 0.9, u * 0.62, u * 1.8, lw * 1.1);
      break;
    case 'gallery': // framed picture
      P(() => g.rect(-u * 0.8, -u * 0.62, u * 1.6, u * 1.24));
      P(() => {
        g.moveTo(-u * 0.6, u * 0.45);
        g.lineTo(-u * 0.15, -u * 0.1);
        g.lineTo(u * 0.15, u * 0.2);
        g.lineTo(u * 0.35, 0);
        g.lineTo(u * 0.6, u * 0.45);
        g.closePath();
      }, true);
      break;
    case 'theatre': // mask with eyes + smile
      P(() => {
        g.moveTo(-u * 0.75, -u * 0.75);
        g.quadraticCurveTo(0, -u * 0.5, u * 0.75, -u * 0.75);
        g.quadraticCurveTo(u * 0.8, u * 0.75, 0, u * 0.85);
        g.quadraticCurveTo(-u * 0.8, u * 0.75, -u * 0.75, -u * 0.75);
      }, true);
      g.fillStyle = g.strokeStyle = bg;
      P(() => g.ellipse(-u * 0.32, -u * 0.22, u * 0.16, u * 0.11, 0, 0, Math.PI * 2), true);
      P(() => g.ellipse(u * 0.32, -u * 0.22, u * 0.16, u * 0.11, 0, 0, Math.PI * 2), true);
      g.lineWidth = lw * 0.9;
      P(() => g.arc(0, u * 0.12, u * 0.33, 0.2 * Math.PI, 0.8 * Math.PI));
      break;
    case 'cinema': // clapperboard
      g.fillRect(-u * 0.8, -u * 0.15, u * 1.6, u * 0.95);
      P(() => {
        g.moveTo(-u * 0.8, -u * 0.32);
        g.lineTo(u * 0.75, -u * 0.72);
      });
      break;
    case 'shop': // bag with handle
      P(() => {
        g.moveTo(-u * 0.7, -u * 0.25);
        g.lineTo(u * 0.7, -u * 0.25);
        g.lineTo(u * 0.6, u * 0.8);
        g.lineTo(-u * 0.6, u * 0.8);
        g.closePath();
      }, true);
      P(() => g.arc(0, -u * 0.25, u * 0.36, Math.PI, 0));
      break;
    case 'park': // tree
      P(() => g.arc(0, -u * 0.22, u * 0.58, 0, Math.PI * 2), true);
      g.fillRect(-lw * 0.6, u * 0.2, lw * 1.2, u * 0.65);
      break;
    case 'viewpoint': // sun on the horizon
      P(() => g.arc(0, u * 0.28, u * 0.42, Math.PI, 0), true);
      for (const a of [-150, -115, -90, -65, -30]) {
        const r = (a * Math.PI) / 180;
        P(() => {
          g.moveTo(Math.cos(r) * u * 0.6, u * 0.28 + Math.sin(r) * u * 0.6);
          g.lineTo(Math.cos(r) * u * 0.85, u * 0.28 + Math.sin(r) * u * 0.85);
        });
      }
      P(() => {
        g.moveTo(-u * 0.85, u * 0.45);
        g.lineTo(u * 0.85, u * 0.45);
      });
      break;
    case 'landmark': // five-point star
      P(() => {
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 ? u * 0.38 : u * 0.85;
          if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
      }, true);
      break;
  }
  g.restore();
}

export interface IconOpts {
  /** CSS px of the shape's diameter. */
  size: number;
  dpr?: number;
  /** Soft coloured halo (bars at night, viewpoints at sunset, featured places). */
  glow?: number;
  /** Featured style: white ring + a little tail (pin). */
  pin?: boolean;
  /** Halo colour (default: the category colour). */
  glowColor?: string;
}

/** Canvas with one icon; the shape sits at the top, a pin tail (if any) below. */
export function iconCanvas(k: IconKind, o: IconOpts): HTMLCanvasElement {
  const dpr = o.dpr ?? 2;
  const r = (o.size / 2) * (k === 'landmark' ? 1.12 : 1);
  const pad = Math.ceil((o.glow ? r * 0.75 : 3) + 2);
  const w = Math.ceil(2 * (r * 1.15 + pad));
  const h = w + (o.pin ? Math.round(r * 0.55) : 0);
  const cv = document.createElement('canvas');
  cv.width = w * dpr;
  cv.height = h * dpr;
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  const cx = w / 2;
  const cy = w / 2;
  const c = color(k);
  if (o.glow) {
    const gc = o.glowColor ?? c;
    const grd = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r + pad);
    grd.addColorStop(0, hexA(gc, Math.min(0.95, 0.55 * o.glow)));
    grd.addColorStop(1, hexA(gc, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  }
  if (o.pin) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(cx - r * 0.42, cy + r * 0.7);
    g.lineTo(cx, cy + r * 1.5);
    g.lineTo(cx + r * 0.42, cy + r * 0.7);
    g.fill();
  }
  // Drop shadow, white rim, coloured body.
  g.save();
  g.shadowColor = 'rgba(15, 20, 30, 0.35)';
  g.shadowBlur = r * 0.35;
  g.shadowOffsetY = r * 0.12;
  shapePath(g, SHAPE[k], cx, cy, r);
  g.fillStyle = '#FFFFFF';
  g.fill();
  g.restore();
  shapePath(g, SHAPE[k], cx, cy, r - Math.max(1.4, r * 0.13));
  g.fillStyle = c;
  g.fill();
  drawGlyph(g, k, cx, cy + (k === 'landmark' ? r * 0.03 : 0), r * 1.05, c);
  return cv;
}

export function iconImage(k: IconKind, o: IconOpts): ImageData {
  const cv = iconCanvas(k, o);
  return cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height);
}

const urlCache = new Map<string, string>();
/** data: URL for lists / legend (cached). */
export function iconUrl(k: IconKind, size = 26): string {
  const key = `${k}|${size}`;
  let u = urlCache.get(key);
  if (!u) {
    u = iconCanvas(k, { size, dpr: 3 }).toDataURL('image/png');
    urlCache.set(key, u);
  }
  return u;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Subtle "has a story" marker: cream disc, thin gold ring, small open book. */
export function storyIcon(size: number, dpr = 2): ImageData {
  const w = Math.ceil(size + 6);
  const cv = document.createElement('canvas');
  cv.width = cv.height = w * dpr;
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  const c = w / 2;
  const r = size / 2;
  g.save();
  g.shadowColor = 'rgba(15, 20, 30, 0.25)';
  g.shadowBlur = 3;
  g.shadowOffsetY = 1;
  g.beginPath();
  g.arc(c, c, r, 0, Math.PI * 2);
  g.fillStyle = '#FFF8EA';
  g.fill();
  g.restore();
  g.lineWidth = 1.6;
  g.strokeStyle = CONFIG.icons.storyColor;
  g.stroke();
  // open book
  const u = r * 0.55;
  g.fillStyle = CONFIG.icons.storyColor;
  g.beginPath();
  g.moveTo(c, c - u * 0.55);
  g.quadraticCurveTo(c - u * 0.5, c - u * 0.9, c - u * 1.05, c - u * 0.6);
  g.lineTo(c - u * 1.05, c + u * 0.75);
  g.quadraticCurveTo(c - u * 0.5, c + u * 0.45, c, c + u * 0.8);
  g.quadraticCurveTo(c + u * 0.5, c + u * 0.45, c + u * 1.05, c + u * 0.75);
  g.lineTo(c + u * 1.05, c - u * 0.6);
  g.quadraticCurveTo(c + u * 0.5, c - u * 0.9, c, c - u * 0.55);
  g.fill();
  g.strokeStyle = '#FFF8EA';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(c, c - u * 0.5);
  g.lineTo(c, c + u * 0.75);
  g.stroke();
  return g.getImageData(0, 0, cv.width, cv.height);
}
