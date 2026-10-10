/**
 * Rasterises public/icons/icon.svg into the PWA icons + iOS splash screens (committed PNGs).
 * Needs Playwright + Chromium (preinstalled in the dev container):
 *   node scripts/build-icons.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright');
const fs = require('node:fs');
const svg = fs.readFileSync('public/icons/icon.svg', 'utf8');
const icon = (size, pad = 0) =>
  `<body style="margin:0;background:#F6CFA0"><div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:#F6CFA0"><div style="width:${size - 2 * pad}px;height:${size - 2 * pad}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div></body>`;
const splash = (w, h) =>
  `<body style="margin:0"><div style="width:${w}px;height:${h}px;background:linear-gradient(#BFE3E8,#E8F1EC 46%,#2E8C9A 46%,#1F5E6E);display:grid;place-items:center;font:800 ${Math.round(w / 16)}px Nunito,system-ui,sans-serif;color:#1F5E6E"><div style="display:grid;justify-items:center;gap:${Math.round(w / 30)}px"><div style="width:${Math.round(w / 3)}px;height:${Math.round(w / 3)}px;border-radius:22%;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.25)">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div><div style="color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.3)">İstanbul</div></div></div></body>`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  const shot = async (html, w, h, out) => {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(html);
    await p.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
    console.log('→', out);
  };
  await shot(icon(192), 192, 192, 'public/icons/icon-192.png');
  await shot(icon(512), 512, 512, 'public/icons/icon-512.png');
  await shot(icon(512, 52), 512, 512, 'public/icons/maskable-512.png');
  await shot(icon(180), 180, 180, 'public/icons/apple-touch-icon.png');
  for (const [w, h] of [[1170, 2532], [1179, 2556], [1290, 2796], [750, 1334]]) await shot(splash(w, h), w, h, `public/icons/splash-${w}x${h}.png`);
  await b.close();
})();
