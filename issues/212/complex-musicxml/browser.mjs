// Exercise the complete part editions and a conductor excerpt in Chrome using the original MusicXML archives.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { importMXL } from '../../../importer/dist/mxl.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../../..');
const cache = join(root, 'build/importer-complex-musicxml');
const cases = [
  {
    file: 'Bach_BWV.1048_1.mxl',
    bars: 8,
    parts: 11,
    partIndex: 0,
    conductor: true,
    selection: { firstMeasure: 1, lastMeasure: 8 },
  },
  { file: 'Bach_BWV.1048_1.mxl', bars: 137, parts: 11, partIndex: 0, preview: 'violin' },
  { file: 'Bach_BWV.1048_3.mxl', bars: 48, parts: 11, partIndex: 0 },
  { file: 'lc7111114.mxl', bars: 120, parts: 2, partIndex: 0 },
  { file: 'lc7111114.mxl', bars: 120, parts: 2, partIndex: 1, preview: 'piano' },
  { file: 'lc29062370.mxl', bars: 148, parts: 2, partIndex: 1 },
  { file: 'Beethoven_Op.67_1.mxl', bars: 502, parts: 18, partIndex: 2 },
];
const browser = await chromium.launch(
  process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' },
);
try {
  for (const c of cases) {
    const source = readFileSync(join(cache, c.file));
    const imported = await importMXL(source, {
      mode: 'partial',
      targetProfile: 'expressive',
      capacity: 'large',
      selection: c.selection,
    });
    assert.equal(imported.status, 'partial');
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    try {
      await page.setContent(
        '<style>body{margin:20px;background:white;color:black}main{width:1120px}aside{position:absolute;left:-200vw}</style><main></main><aside></aside>',
      );
      await page.addScriptTag({ path: join(root, 'dist/main.dev.js') });
      const proof = await page.evaluate(
        ({ source, partIndex, conductor }) => {
          const api = window.vextab,
            host = document.querySelector('main');
          host.textContent = source;
          const editor = new api.Div(host, {
            capacity: 'large',
            player: false,
            ...(conductor ? { view: 'conductor' } : { partIndex }),
          });
          const model = editor.getScoreDocument();
          const print = api.renderEdition(document.querySelector('aside'), model, { partIndex });
          if (print.diagnostics.length) throw Error(JSON.stringify(print.diagnostics));
          const pages = print.publication.pages;
          return {
            bars: pages.flatMap((p) => JSON.parse(p.svg.querySelector('metadata').textContent).measures),
            screenHeads: host.querySelectorAll('.vf-notehead').length,
            printHeads: pages.reduce((n, p) => n + p.svg.querySelectorAll('.vf-notehead').length, 0),
            parts: model.parts.length,
            pages: pages.length,
          };
        },
        { source: imported.documents[0].text, partIndex: c.partIndex, conductor: c.conductor },
      );
      assert.deepEqual(
        proof.bars,
        Array.from({ length: c.bars }, (_, i) => i + 1),
      );
      assert.equal(proof.parts, c.parts);
      assert.ok(proof.screenHeads > 0 && proof.printHeads > 0);
      if (c.conductor) assert.ok(proof.screenHeads > proof.printHeads);
      await page.screenshot({ path: join(cache, c.file + (c.preview ? '.' + c.preview : '') + '.preview.png') });
      console.log(
        c.file +
          ' → ' +
          proof.screenHeads +
          ' screen noteheads, ' +
          proof.printHeads +
          ' printed noteheads, ' +
          proof.pages +
          ' printed page(s).',
      );
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
