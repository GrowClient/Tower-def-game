/**
 * Render every tower out of the game's own draw code, at print resolution.
 *
 * The art is geometry, not assets, so there is nothing to "extract" — it is
 * re-run at a bigger scale. Which also means these are not upscaled sprites:
 * every curve is redrawn at the output size and stays sharp at any dimension.
 *
 * Composed exactly as the board composes a tower (plinth, then art, for the
 * ones that stand beside the road) so nothing here is a tower the player has
 * never seen.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const OUT = process.env.OUT || 'towerart';
const TILE = Number(process.env.TILE || 768);

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:5173/?seed=5', { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const result = await page.evaluate(async ({ tile }) => {
    const [de, pal, bal] = await Promise.all([
      import('/src/render/drawEntities.ts'),
      import('/src/render/palette.ts'),
      import('/src/config/balance.ts'),
    ]);

    // Unique kinds, remembering which age each belongs to (the Exchanger is
    // buildable in all three, and should be drawn in the age it looks like).
    const seen = new Map();
    bal.BUILD_ORDER.forEach((kinds, age) => {
      for (const k of kinds) if (!seen.has(k)) seen.set(k, age);
    });

    const out = [];
    for (const [kind, age] of seen) {
      const def = bal.TOWERS[kind];
      const biome = pal.biomeFor(age);
      for (let level = 1; level <= 4; level++) {
        for (const plinth of [true, false]) {
          const c = document.createElement('canvas');
          c.width = tile;
          c.height = tile;
          const g = c.getContext('2d');
          g.translate(tile / 2, tile / 2);
          // Scaled so the widest thing the art ever draws — the top tier's halo
          // at 1.8s — still lands inside the tile. Identical at every level, so
          // the four tiers stack pixel-on-pixel if you want an upgrade strip.
          const s = tile * 0.27;
          if (plinth && !def.onPath) de.drawPlinth(g, s, biome);
          // aim slightly upward so barrels read as three-quarter, not flat on
          de.drawTowerArt(g, kind, s, -0.35, 0, biome, level);
          out.push({ kind, age, level, plinth, label: def.label, png: c.toDataURL('image/png') });
        }
      }
    }
    return { out, ages: bal.AGES ? bal.AGES.map((a) => a.name) : ['Stone Age', 'Middle Age', 'Tech Age'] };
  }, { tile: TILE });

  fs.mkdirSync(OUT, { recursive: true });
  const AGE_DIR = ['1-stone-age', '2-middle-age', '3-tech-age'];
  const levelName = ['', 'lv1', 'lv2-silver', 'lv3-gold', 'lv4-emerald'];

  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const index = [];
  for (const t of result.out) {
    const dir = path.join(OUT, t.plinth ? 'on-plinth' : 'tower-only', AGE_DIR[t.age]);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${slug(t.label)}-${levelName[t.level]}.png`);
    fs.writeFileSync(file, Buffer.from(t.png.split(',')[1], 'base64'));
    if (t.plinth && t.level === 1) index.push({ label: t.label, kind: t.kind, age: t.age });
  }
  fs.writeFileSync(path.join(OUT, 'towers.json'), JSON.stringify(index, null, 2));
  console.log(`wrote ${result.out.length} PNGs (${TILE}x${TILE}, transparent) to ${OUT}/`);
  if (errors.length) console.log('ERRORS: ' + errors.join(' | '));
  await browser.close();
})();
