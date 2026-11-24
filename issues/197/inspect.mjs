// Render the ensemble control and Haydn theme with the current development bundle for issue review.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const output = resolve('build/vt6-m2');
const quartet = await readFile('guide/scores/haydn-emperor-theme.vextab', 'utf8');
const control = 'meter 4/4 staff { times 4 { :8 C4 D4 E4 F4 G4 F4 E4 D4 | } } staff { clef bass times 4 { :w C3 | } }';
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
  await page.setContent('<style>body{background:white;margin:0}#score{width:max-content}</style><div id="score"></div>');
  await page.addScriptTag({ path: resolve('node_modules/vexflow/build/cjs/vexflow.js') });
  await page.addScriptTag({ path: resolve('dist/main.dev.js') });
  await page.evaluate(async () => { await window.vextab.Vex.Flow.loadFonts('Bravura', 'Academico'); await document.fonts.ready; });
  const readings = [];
  for (const [name, source, width, independent] of [
    ['separate', control, 360, true], ['conductor', control, 360, false],
    ['haydn-wide', quartet, 800, false], ['haydn-narrow', quartet, 360, false],
  ]) {
    const result = await page.evaluate(({ source, width, independent }) => {
      const vt = window.vextab, score = vt.parseScore(source);
      const root = document.querySelector('#score');
      root.replaceChildren();
      const views = independent ? score.parts.map((_, partIndex) =>
        vt.renderScore(root.appendChild(document.createElement('div')), score, { partIndex, width })) :
        [vt.renderConductor(root, score, { width })];
      const rows = views.map(view => view.composition.sheet.getContinuousLayout().rows);
      const crop = rows[0][1]?.y ?? root.offsetHeight;
      return { rows: rows.map(rs => rs.map(r => r.measures)), crop, height: root.offsetHeight,
        events: views.map(view => view.navigation.events.length),
        barlines: views.map(view => view.composition.staves.map(staves => staves.map(s => s.getX() + s.getWidth()))) };
    }, { source, width, independent });
    readings.push({ name, ...result });
    const height = name.startsWith('haydn') ? Math.ceil(result.crop - 12) : result.height;
    await page.screenshot({ clip: { x: 0, y: 0, width, height }, path: join(output, name + '.png') });
  }
  await writeFile(join(output, 'geometry.json'), JSON.stringify({ chrome: browser.version(), readings }, null, 2) + '\n');
  console.log(output);
} finally { await browser.close(); }
