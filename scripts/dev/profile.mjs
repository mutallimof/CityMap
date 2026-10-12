/**
 * Boot profile of a running build (npm run build + vite preview, or the dev server) in headless Chromium
 * (software WebGL via SwiftShader — numbers are relative, a real phone differs).
 *   node scripts/dev/profile.mjs <out.json> "<query>" [durationMs=15000] [runs=3]
 * e.g. BASE_URL=http://localhost:4173/CityMap/ node scripts/dev/profile.mjs /tmp/p.json "adaptive=0&theme=toy"
 * Per run: CPU profile (self time by function, JS + GC time), long tasks, the moment the loader goes
 * (map + HUD up), "usable" (end of the last long task before 3 s without any, after the loader went) and
 * bytes fetched by the page up to then (resource timing: same origin / other; map tiles come from workers and
 * are not counted). FOCUS=<regex on "function@file"> adds time spent under matching functions and its longest unbroken
 * stretch (needs a build with readable names: vite build --minify false). Prints the medians; writes every run.
 */
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright'));
}
const [out, qs = '', durMs = '15000', runsArg = '3'] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:4173/CityMap/';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [];
const QUIET = 3000;

async function run() {
  const browser = await chromium.launch({
    ...(exe ? { executablePath: exe } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...proxy],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__long = [];
    window.__loaderDone = null;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__long.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
    const watch = () => {
      const el = document.getElementById('loader');
      if (!el) return setTimeout(watch, 5);
      new MutationObserver(() => {
        if (window.__loaderDone === null && (el.classList.contains('loader--done') || !el.isConnected)) window.__loaderDone = performance.now();
      }).observe(el, { attributes: true });
    };
    watch();
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const sep = qs.startsWith('?') || qs.startsWith('#') ? '' : '?';
  await page.goto(`${base}${sep}${qs}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(+durMs);
  const { profile } = await cdp.send('Profiler.stop');
  const { long, loaderDone, res } = await page.evaluate(() => ({
    long: window.__long,
    loaderDone: window.__loaderDone,
    res: performance.getEntriesByType('resource').map((e) => ({ url: e.name, t: e.startTime, bytes: e.transferSize || e.encodedBodySize })),
  }));
  await browser.close();

  // Usable: after the loader went, the end of the last long task before a quiet window of QUIET ms.
  let usable = loaderDone ?? NaN;
  for (const [s, d] of long.filter(([s, d]) => s + d >= (loaderDone ?? 0)).sort((a, b) => a[0] - b[0])) {
    if (s - usable > QUIET) break;
    usable = Math.max(usable, s + d);
  }
  // CPU profile: self time per function (ms), and JS + GC time up to "usable".
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  // FOCUS=<regex>: time with a matching function anywhere on the stack, and its longest unbroken stretch.
  const focus = process.env.FOCUS ? new RegExp(process.env.FOCUS) : null;
  const onStack = (id) => {
    for (let x = id; x !== undefined; x = parent.get(x)) if (focus.test(`${byId.get(x).callFrame.functionName}@${byId.get(x).callFrame.url.split('/').pop()}`)) return true;
    return false;
  };
  let focusMs = 0;
  let focusRun = 0;
  let focusMax = 0;
  const self = new Map();
  let busy = 0;
  let busyToUsable = 0;
  let t = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    const dt = (profile.timeDeltas[i] ?? 0) / 1000;
    t += profile.timeDeltas[i] ?? 0;
    const name = n.callFrame.functionName || '(anonymous)';
    if (focus) {
      if (onStack(n.id)) {
        focusMs += dt;
        focusRun += dt;
        focusMax = Math.max(focusMax, focusRun);
      } else if (name !== '(program)') focusRun = 0; // (program) = native work inside the same task
    }
    if (name === '(idle)' || name === '(program)') continue;
    busy += dt;
    if ((t - profile.startTime) / 1000 <= usable) busyToUsable += dt;
    const key = `${name} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + dt);
  }
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, Math.round(v)]);
  // Bytes the page fetched until "usable" (resource timing; map tiles are fetched by workers and not counted).
  const origin = new URL(base).origin;
  const bytes = { sameOrigin: 0, other: 0 };
  for (const r of res) if (r.t <= usable) bytes[r.url.startsWith(origin) ? 'sameOrigin' : 'other'] += r.bytes;
  const sameOriginFiles = res.filter((r) => r.url.startsWith(origin)).map((r) => [r.url.replace(origin, ''), r.bytes, Math.round(r.t)]);
  return {
    loaderDoneMs: Math.round(loaderDone ?? -1),
    usableMs: Math.round(usable),
    longTasks: long.length,
    longTaskMs: Math.round(long.reduce((a, [, d]) => a + d, 0)),
    longest: Math.round(Math.max(0, ...long.map(([, d]) => d))),
    longList: long.map(([s, d]) => [Math.round(s), Math.round(d)]),
    jsMsTotal: Math.round(busy),
    jsMsToUsable: Math.round(busyToUsable),
    bytes,
    sameOriginFiles,
    ...(focus ? { focusMs: Math.round(focusMs), focusLongestMs: Math.round(focusMax) } : {}),
    top,
  };
}

const runs = [];
for (let i = 0; i < +runsArg; i++) {
  const r = await run();
  runs.push(r);
  console.log(`run ${i + 1}: loader ${r.loaderDoneMs} ms · usable ${r.usableMs} ms · long tasks ${r.longTasks} (${r.longTaskMs} ms, longest ${r.longest}) · JS ${r.jsMsToUsable}/${r.jsMsTotal} ms · app bytes ${(r.bytes.sameOrigin / 1024).toFixed(0)} kB${r.focusMs !== undefined ? ` · focus ${r.focusMs} ms (longest ${r.focusLongestMs})` : ''}`);
}
const med = (f) => {
  const v = runs.map(f).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};
const summary = {
  loaderDoneMs: med((r) => r.loaderDoneMs),
  usableMs: med((r) => r.usableMs),
  longTasks: med((r) => r.longTasks),
  longTaskMs: med((r) => r.longTaskMs),
  longest: med((r) => r.longest),
  jsMsToUsable: med((r) => r.jsMsToUsable),
  jsMsTotal: med((r) => r.jsMsTotal),
  sameOriginKB: med((r) => Math.round(r.bytes.sameOrigin / 1024)),
  otherKB: med((r) => Math.round(r.bytes.other / 1024)),
};
console.log('median', JSON.stringify(summary));
console.log('top self time (run 1):');
for (const [k, v] of runs[0].top.slice(0, 20)) console.log(`  ${String(v).padStart(6)} ms  ${k}`);
writeFileSync(out, JSON.stringify({ query: qs, summary, runs }, null, 1));
