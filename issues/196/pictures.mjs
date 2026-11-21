// Capture M1 score regions from a built bundle. Keep white-background images with the issue.
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const [bundle, directory] = process.argv.slice(2);
if (!bundle || !directory) throw new Error('Usage: node issues/196/pictures.mjs BUNDLE OUTPUT_DIRECTORY');
await mkdir(directory, { recursive: true });
const river = await readFile('guide/scores/slow-river.vextab', 'utf8');
const sor = await readFile('issues/196/sor-op35-no22.vextab', 'utf8');
const browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1200 }, deviceScaleFactor: 1 });
  await page.setContent('<style>body{margin:0;background:white}#score{width:fit-content;background:white}svg{display:block}</style><div id="score"></div>');
  await page.addScriptTag({ path: resolve(bundle) });
  await page.evaluate(async () => { await window.vextab.Vex.Flow.loadFonts('Bravura', 'Academico'); await document.fonts.ready; });
  const screen = await page.evaluate(source => {
    const vt = window.vextab, host = document.querySelector('#score');
    const view = vt.renderScore(host, vt.parseScore(source), { width: 560 });
    const words = [...host.querySelectorAll('text')].filter(e => ['roll', 'to', 'sea'].includes(e.textContent));
    const stave = host.querySelectorAll('.vf-stave')[1].getBoundingClientRect();
    const top = Math.floor(stave.top - 53);
    return { baselines: words.map(w => Number(w.getAttribute('y'))), rows: view.composition.sheet.getContinuousLayout().rows.map(r => r.measures),
      clip: { x: 0, y: top, width: 560, height: Math.ceil(Math.max(...words.map(w => w.getBoundingClientRect().bottom)) - top + 16) } };
  }, river);
  console.log('Slow River', screen);
  await page.screenshot({ path: resolve(directory, 'verse.png'), clip: screen.clip });
  for (const [name, text, part] of [['river', river, 'notation'], ['sor-notation', sor, 'notation'], ['sor-tab', sor, 'tab']]) {
    const result = await page.evaluate(({ text, part }) => {
      const vt = window.vextab;
      const { publication } = vt.renderScorePart(document.querySelector('#score'), vt.parseScore(text), part, { title: part === 'tab' ? 'Sor · Op. 35 No. 22 · TAB' : text.includes('Slow,') ? 'Slow River' : 'Sor · Op. 35 No. 22' });
      const row = publication.pages[0].svg.querySelector('[data-system]');
      const bounds = row.getBoundingClientRect();
      return { pages: publication.pages.length, diagnostics: publication.diagnostics, clip: { x: Math.max(0,Math.floor(bounds.x-8)), y: Math.max(0,Math.floor(bounds.y-8)), width: Math.ceil(bounds.width+16), height: Math.ceil(bounds.height+16) } };
    }, { text, part });
    console.log(name, result);
    await page.screenshot({ path: resolve(directory, name + '.png'), clip: result.clip });
  }
} finally { await browser.close(); }
