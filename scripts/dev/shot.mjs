/**
 * Headless screenshot of the running dev server (npm run dev) with real WebGL (SwiftShader).
 *   node scripts/dev/shot.mjs <out.png> "<query/hash>" [waitMs=9000] [width=430] [height=860]
 * e.g. node scripts/dev/shot.mjs /tmp/a.png "adaptive=0&intro=0&t=19:00&view=29.0,41.02,14&theme=toy"
 * Env: EVAL='<js expr>' prints its JSON value after the wait. Uses the globally installed Playwright and
 * the pre-installed Chromium (PLAYWRIGHT_BROWSERS_PATH); tiles go through HTTPS_PROXY when set.
 * Always pass adaptive=0&intro=0 (headless runs at a few fps; the intro / adaptive ladder would interfere)
 * and set the camera with ?view= (camera jumps crash the headless browser).
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright'));
}
const [out, qs = '', waitMs = '9000', w = '430', h = '860'] = process.argv.slice(2);
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [];
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...proxy],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 200)}`);
});
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.addInitScript(() => {
  window.__long = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* no longtask API */
  }
});
const sep = qs.startsWith('?') || qs.startsWith('#') ? '' : '?';
await page.goto(`${process.env.BASE_URL ?? 'http://localhost:5173/'}${sep}${qs}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out });
if (process.env.EVAL) console.log('eval:', JSON.stringify(await page.evaluate(process.env.EVAL)));
if (logs.length) console.log(logs.slice(0, 15).join('\n'));
await browser.close();
