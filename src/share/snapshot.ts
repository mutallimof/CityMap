import type { Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';

export interface SnapshotText {
  /** Small watermark (app name). */
  mark: string;
  /** Caption line, e.g. "Kadıköy · 18:42 · 🌧 14°". */
  caption: string;
}

/** Grab the next rendered map frame (WebGL buffer is only valid inside the render event). */
function grabFrame(map: MlMap): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    map.once('render', () => {
      const src = map.getCanvas();
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')!.drawImage(src, 0, 0);
      resolve(c);
    });
    map.triggerRepaint();
  });
}

/** Crop rectangle (cover) for a target aspect ratio w/h, centred. Pure. */
export function cropFor(w: number, h: number, aspect: number): { x: number; y: number; w: number; h: number } {
  if (w / h > aspect) {
    const cw = Math.round(h * aspect);
    return { x: Math.round((w - cw) / 2), y: 0, w: cw, h };
  }
  const ch = Math.round(w / aspect);
  return { x: 0, y: Math.round((h - ch) / 2), w, h: ch };
}

/**
 * A shareable picture of this map moment: the live map (ferries, weather, light) cropped to 4:5
 * (Instagram feed), with a caption and a small watermark. Returns a PNG blob.
 */
export async function snapshot(map: MlMap, text: SnapshotText): Promise<Blob> {
  const s = CONFIG.snapshot;
  const frame = await grabFrame(map);
  const crop = cropFor(frame.width, frame.height, s.aspect);
  const scale = Math.min(1, s.maxHeight / crop.h);
  const out = document.createElement('canvas');
  out.width = Math.round(crop.w * scale);
  out.height = Math.round(crop.h * scale);
  const g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(frame, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);

  const u = out.width / 1080; // layout unit: sizes below are for a 1080 px wide image
  // Soft gradient at the bottom so the text reads on any map.
  const grad = g.createLinearGradient(0, out.height * 0.78, 0, out.height);
  grad.addColorStop(0, 'rgba(10,20,30,0)');
  grad.addColorStop(1, 'rgba(10,20,30,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, out.height * 0.78, out.width, out.height * 0.22);

  const font = (w: number, px: number) => `${w} ${Math.round(px * u)}px Nunito, system-ui, sans-serif`;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#FFFFFF';
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 8 * u;
  g.font = font(800, 46);
  g.fillText(text.caption, 48 * u, out.height - 64 * u);
  // Watermark pill, bottom right.
  g.font = font(800, 26);
  const label = `⛴ ${text.mark}`;
  const tw = g.measureText(label).width;
  const ph = 50 * u;
  const px = out.width - tw - 48 * u - 36 * u;
  const py = out.height - 64 * u - ph + 12 * u;
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,250,242,0.88)';
  g.beginPath();
  g.roundRect(px, py, tw + 36 * u, ph, ph / 2);
  g.fill();
  g.fillStyle = '#1F5E6E';
  g.fillText(label, px + 18 * u, py + ph / 2 + 9 * u);
  // OSM credit (tiny, top-left) — the map data is OpenStreetMap.
  g.font = font(700, 18);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.shadowColor = 'rgba(0,0,0,0.4)';
  g.shadowBlur = 4 * u;
  g.fillText('© OpenStreetMap', 24 * u, 40 * u);

  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

/** Open the share sheet with the image (Instagram & co. on phones); download it elsewhere. */
export async function shareImage(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
