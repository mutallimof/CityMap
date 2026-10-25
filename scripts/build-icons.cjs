/**
 * Rasterises the app mark into the PWA icons, the PNG favicon and the iOS splash screens (committed files):
 * public/icons/icon.svg (rounded), public/icons/maskable.svg (full bleed, artwork inside the safe zone),
 * public/favicon.svg, public/wordmark.svg. Needs Playwright + Chromium (preinstalled in the dev container):
 *   node scripts/build-icons.cjs
 */
const { chromium } = require(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright');
const fs = require('node:fs');
const uri = (f) => `data:image/svg+xml;base64,${fs.readFileSync(f).toString('base64')}`;
const SEA = '#43B3E6';
const img = (f, size, bg = 'transparent') =>
  `<body style="margin:0;background:${bg}"><img src="${uri(f)}" width="${size}" height="${size}" style="display:block"></body>`;
const splash = (w, h) =>
  `<body style="margin:0"><div style="width:${w}px;height:${h}px;background:${SEA};display:grid;place-items:center"><img src="${uri('public/wordmark.svg')}" style="width:${Math.round(w * 0.72)}px;filter:drop-shadow(0 ${Math.round(w / 60)}px ${Math.round(w / 30)}px rgba(0,0,0,.2))"></div></body>`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  const shot = async (html, w, h, out, transparent = false) => {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(html);
    await p.screenshot({ path: out, omitBackground: transparent });
    console.log('→', out);
  };
  await shot(img('public/icons/icon.svg', 192), 192, 192, 'public/icons/icon-192.png', true);
  await shot(img('public/icons/icon.svg', 512), 512, 512, 'public/icons/icon-512.png', true);
  await shot(img('public/icons/maskable.svg', 512), 512, 512, 'public/icons/maskable-512.png');
  await shot(img('public/icons/icon.svg', 180, SEA), 180, 180, 'public/icons/apple-touch-icon.png');
  await shot(img('public/favicon.svg', 32), 32, 32, 'public/favicon-32.png', true);
  for (const [w, h] of [[1170, 2532], [1179, 2556], [1290, 2796], [750, 1334]]) await shot(splash(w, h), w, h, `public/icons/splash-${w}x${h}.png`);
  await b.close();
})();
