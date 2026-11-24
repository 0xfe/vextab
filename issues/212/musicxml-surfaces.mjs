// Exercise the new score grammar on the same white page, SVG screen and printed part a reader sees.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { importMusicXML } from '../../importer/dist/musicxml.js';
import { importMXL } from '../../importer/dist/mxl.js';

const folder = new URL('musicxml/', import.meta.url);
const options = { mode: 'partial', targetProfile: 'expressive' };
const counted = importMusicXML(readFileSync(new URL('45a-SimpleRepeat.musicxml', folder)), options);
const song = await importMXL(readFileSync(new URL('Echigo-Jishi.mxl', folder)), options);
const browser = await chromium.launch(
  process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' },
);
try {
  for (const [r, text, bars] of [
    [counted, '×5', 2],
    [song, 'ツ', 47],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.setContent(
      '<style>body{background:white}section{width:1120px}</style><section></section><aside></aside>',
    );
    await page.addScriptTag({ path: resolve('dist/main.dev.js') });
    const observed = await page.evaluate(
      ({ source, needle }) => {
        const host = document.querySelector('section');
        host.textContent = source;
        const div = new window.vextab.Div(host, { player: false });
        const score = div.getScoreDocument();
        const print = window.vextab.renderEdition(document.querySelector('aside'), score, { partIndex: 0 });
        if (print.diagnostics.length) throw Error(JSON.stringify(print.diagnostics));
        const find = (root) =>
          [...root.querySelectorAll('svg text, svg tspan')].some((n) => n.textContent.trim() === needle);
        return {
          screen: find(host),
          print: find(document.querySelector('aside')),
          bars: print.publication.pages.flatMap(
            (p) => JSON.parse(p.svg.querySelector('metadata').textContent).measures,
          ),
        };
      },
      { source: r.documents[0].text, needle: text },
    );
    assert.ok(observed.screen && observed.print, JSON.stringify(observed));
    assert.deepEqual(
      observed.bars,
      Array.from({ length: bars }, (_, i) => i + 1),
    );
    await page.close();
    console.log(text + ' appears on screen and in the printed edition covering ' + bars + ' bars.');
  }
} finally {
  await browser.close();
}
