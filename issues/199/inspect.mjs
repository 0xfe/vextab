// Render real passages and bounded controls through the public screen and publication APIs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright-core';

const directory = resolve('build/vt6-m4');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1 });
  await page.setContent('<style>body{margin:0;background:white}</style><div id="score"></div>');
  await page.addScriptTag({ path: resolve('node_modules/vexflow/build/cjs/vexflow.js') });
  await page.addScriptTag({ path: resolve(process.argv[2] ?? 'dist/main.dev.js') });
  await page.evaluate(async () => { await window.vextab.Vex.Flow.loadFonts('Bravura','Academico'); await document.fonts.ready; });
  const before = process.argv.includes('--before');
  // M3 can read the same notes, barlines and breaks using its single verse and text chord.
  const previousVoice = 'meter 2/4 transpose 2 staff { :q C4[symbol "Cm7/Bb", lyric "Ky" hyphen] D4[lyric "ri"] | break system :q E4[lyric "e"] F4 | }';
  for (const [name, file] of [
    ['handy', 'guide/scores/handy-st-louis-blues.vextab'], ['joplin', 'guide/scores/joplin-maple-leaf.vextab'],
    ['sor','guide/scores/sor-op35-no22.vextab'], ...['rhythm','techniques','voice'].map(n => [n, 'issues/199/' + n + '.vextab']),
  ]) {
    if (before && !['voice', 'joplin'].includes(name)) continue;
    let source = await readFile(file, 'utf8');
    if (before) source = name === 'voice' ? previousVoice : source.replace(/\[(?:onStaff lower|dynamic [a-z]+)(?:, dynamic [a-z]+)?\]/g, '');
    const filename = (before ? 'before-' : '') + name;
    const result = await page.evaluate(({ source, name }) => {
      const vt = window.vextab, model = vt.parseScore(source), host = document.querySelector('#score');
      const editions = ['conductor', ...model.parts.map((_,partIndex) => ({partIndex}))].map(target => {
        const print = vt.renderEdition(host, model, target, { staffSize: 6 });
        return { target, pages: print.publication.pages.length, diagnostics: print.diagnostics.map(d => d.detail) };
      });
      const view = vt.renderConductor(host, model, { width: name === 'rhythm' ? 600 : 920 });
      return { editions, events: view.navigation.events.length, systems: view.composition.sheet.getContinuousLayout().rows.map(r=>r.measures),
        diagnostics: view.diagnostics.map(d=>d.code), height: host.offsetHeight };
    }, { source, name });
    await page.setViewportSize({ width: 1000, height: Math.max(1000, result.height) });
    await page.screenshot({ path: join(directory, filename + '.png'), clip: { x: 0, y: 0, width: name === 'rhythm' ? 600 : 920, height: result.height } });
    await writeFile(join(directory, filename + '.json'), JSON.stringify(result, null, 2));
    console.log(name, JSON.stringify(result));
  }
} finally { await browser.close(); }
