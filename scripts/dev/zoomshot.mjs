/**
 * Browser-zoom check of the running dev server: for each zoom z the page gets a CSS viewport of w/z × h/z at
 * deviceScaleFactor z (what Ctrl + does), takes <outPrefix>-<z×100>.png and, with METRICS=1, prints buttons that run
 * off the screen (outside a scroller) and pairs of visible controls that overlap (`top=` = the one drawn on top).
 *   node scripts/dev/zoomshot.mjs <outPrefix> "<query/hash>" [waitMs] [w] [h] [zooms]
 * e.g. METRICS=1 node scripts/dev/zoomshot.mjs /tmp/z "adaptive=0&intro=0&theme=toy#place=galata-kulesi" 9000 390 844 1,1.25,1.5,2
 * Env: BASE_URL, ACT='<js>' (runs after the wait, e.g. ui.set({themes:true})).
 */
import { createRequire } from 'node:module';
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright'));
}
const [out, qs = '', waitMs = '9000', w = '390', h = '844', zs = '1,1.25,1.5,2'] = process.argv.slice(2);
const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...proxy] });
for (const z of zs.split(',').map(Number)) {
  const page = await browser.newPage({ viewport: { width: Math.round(+w / z), height: Math.round(+h / z) }, deviceScaleFactor: z });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${process.env.BASE_URL ?? 'http://localhost:5173/'}${qs.startsWith('?') || qs.startsWith('#') ? '' : '?'}${qs}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(+waitMs);
  if (process.env.ACT) { await page.evaluate(process.env.ACT); await page.waitForTimeout(2500); }
  await page.screenshot({ path: `${out}-${Math.round(z * 100)}.png` });
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const off = [], items = [];
    const sel = '#ui button, #ui a, #ui h2, #ui .chip, .maplibregl-ctrl-attrib-inner a';
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let p = el.parentElement, clipped = false, hidden = false;
      while (p) { const s = getComputedStyle(p); if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') hidden = true; if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) clipped = true; p = p.parentElement; }
      if (hidden || getComputedStyle(el).visibility === 'hidden') continue;
      if (r.bottom < 0 || r.top > vh) continue;
      if (!clipped && (r.right > vw + 0.5 || r.left < -0.5)) off.push(`${(el.getAttribute('aria-label') || el.textContent || el.className).slice(0, 24)}:${Math.round(r.left)}-${Math.round(r.right)}`);
      items.push({ el, n: (el.getAttribute('aria-label') || el.textContent || el.className).toString().trim().slice(0, 28), r });
    }
    const ov = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const a = A.r, b = B.r;
      const x0 = Math.max(a.left, b.left), x1 = Math.min(a.right, b.right), y0 = Math.max(a.top, b.top), y1 = Math.min(a.bottom, b.bottom);
      if (x1 - x0 > 1 && y1 - y0 > 1) {
        const t = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
        // only a real visual collision if the overlap point shows one of them on top of the other's box
        ov.push(`${A.n} ⨯ ${B.n} @${Math.round(x0)},${Math.round(y0)} top=${t ? (t.getAttribute('aria-label') || t.textContent || t.className).toString().trim().slice(0, 16) : '-'}`);
      }
    }
    return { vw, vh, docW: document.documentElement.scrollWidth, off, ov: ov.slice(0, 25) };
  });
  if (process.env.METRICS) console.log(z, JSON.stringify(m), errs.join(';'));
  await page.close();
}
await browser.close();
