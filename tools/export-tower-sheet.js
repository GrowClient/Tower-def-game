/**
 * A labelled contact sheet of every tower, grouped by age.
 *
 * LEVEL=1..4 picks the tier. On a dark plate, because that is what the towers
 * are drawn to sit on and a transparent PNG viewed on white reads as a
 * different piece of art entirely.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

const LEVEL = Number(process.env.LEVEL || 1);
const OUT = process.env.OUT || `tower-sheet-lv${LEVEL}.png`;
const LEVEL_NAME = ['', 'lv1', 'lv2-silver', 'lv3-gold', 'lv4-emerald'][LEVEL];

const AGES = [
  { dir: '1-stone-age', title: 'STONE AGE', accent: '#E8A33D' },
  { dir: '2-middle-age', title: 'MIDDLE AGE', accent: '#7FC4E8' },
  { dir: '3-tech-age', title: 'TECH AGE', accent: '#8FE3FF' },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const page = await browser.newPage();

  const rows = AGES.map((a) => ({
    ...a,
    items: fs
      .readdirSync(`towerart/on-plinth/${a.dir}`)
      .filter((f) => f.endsWith(`-${LEVEL_NAME}.png`))
      .sort()
      .map((f) => ({
        name: f
          .replace(`-${LEVEL_NAME}.png`, '')
          .split('-')
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(' '),
        png:
          'data:image/png;base64,' +
          fs.readFileSync(`towerart/on-plinth/${a.dir}/${f}`).toString('base64'),
      })),
  }));

  const dataUrl = await page.evaluate(async ({ rows, level }) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const CELL = 200, PAD = 26, HEAD = 54, TOPBAR = 92;
    const cols = Math.max(...rows.map((r) => r.items.length));
    const W = PAD * 2 + cols * CELL;
    const H = TOPBAR + rows.length * (HEAD + CELL + 34) + PAD;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    g.fillStyle = '#14110C';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.fillStyle = '#F6E7C4';
    g.font = '700 40px ui-monospace, monospace';
    g.fillText('AGES OF DEFENSE — TOWERS', W / 2, 52);
    g.fillStyle = '#9A8E77';
    g.font = '500 18px ui-monospace, monospace';
    const tier = ['', 'level 1', 'level 2 — silver', 'level 3 — gold', 'level 4 — emerald'][level];
    g.fillText(tier, W / 2, 78);

    let y = TOPBAR;
    for (const row of rows) {
      g.textAlign = 'left';
      g.fillStyle = row.accent;
      g.font = '700 24px ui-monospace, monospace';
      g.fillText(row.title, PAD, y + 34);
      g.strokeStyle = row.accent + '55';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(PAD, y + 44);
      g.lineTo(W - PAD, y + 44);
      g.stroke();

      for (let i = 0; i < row.items.length; i++) {
        const it = row.items[i];
        const img = await load(it.png);
        const x = PAD + i * CELL;
        g.drawImage(img, x + 8, y + HEAD, CELL - 16, CELL - 16);
        g.textAlign = 'center';
        g.fillStyle = '#C9BDA4';
        g.font = '500 15px ui-monospace, monospace';
        g.fillText(it.name, x + CELL / 2, y + HEAD + CELL + 4);
      }
      y += HEAD + CELL + 34;
    }
    return c.toDataURL('image/png');
  }, { rows, level: LEVEL });

  fs.writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote ' + OUT);
  await browser.close();
})();
