// Check the reported noteheads against the actual SVG ink on screen and in independent part editions.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { importMXL } from '../../importer/dist/mxl.js';

const out = resolve('build/importer-fidelity');
await mkdir(out, { recursive: true });
const cases = [
  { id: 'echigo', file: 'issues/212/musicxml/Echigo-Jishi.mxl', part: 0, bar: 1, index: 2 },
  { id: 'haydn', file: 'issues/210/fixtures/haydn.mxl', part: 2, bar: 3, index: 1,
    selection: { firstMeasure: 1, lastMeasure: 128 } },
];
const browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });
try {
  for (const c of cases) {
    const imported = await importMXL(await readFile(c.file), { targetProfile: 'expressive',
      mode: 'partial', capacity: 'large', selection: c.selection });
    assert.equal(imported.status, 'partial');
    const page = await browser.newPage({ viewport: { width: 1150, height: 850 } });
    try {
      await page.setContent('<style>body,svg{background:white}body{margin:14px}</style><main></main><aside></aside>');
      await page.addScriptTag({ path: resolve('node_modules/vexflow/build/cjs/vexflow.js') });
      await page.addScriptTag({ path: resolve('dist/main.dev.js') });
      const proof = await page.evaluate(({ text, part, bar, index }) => {
        const api = window.vextab, model = api.parseScore(text, { capacity: 'large' });
        const voice = model.parts[part].staves[0].voices[0];
        const event = voice.events.filter(e => e.bar === bar)[index];
        const screen = document.querySelector('main');
        api.renderConductor(screen, model, { width: 1000 });
        const print = api.renderEdition(document.querySelector('aside'), model, { partIndex: part });
        const paper = print.publication.pages[0].svg;
        const writtenID = 'notation-' + event.id;
        const screenNote = [...screen.querySelectorAll('.vf-stavenote')].find(n => n.id.endsWith(writtenID));
        const metadata = JSON.parse(paper.querySelector('metadata').textContent);
        const printNote = paper.querySelectorAll('.vf-stavenote')[metadata.events.findIndex(e => e.id.endsWith(writtenID))];
        /** A stem belongs to this head when one end meets its vertical center and one side of its glyph. */
        function geometry(svg, group) {
          const glyph = group.querySelector('.vf-notehead > text');
          const x = Number(glyph.getAttribute('x')), y = Number(glyph.getAttribute('y'));
          for (const path of svg.querySelectorAll('.vf-beam .vf-stem path')) {
            const a = path.getPointAtLength(0), b = path.getPointAtLength(path.getTotalLength());
            if (a.x >= x - 2 && a.x < x + 15 && Math.abs(a.y - y) < 7) {
              return { attachment: a.x - x, rise: a.y - b.y };
            }
          }
          throw Error('No beamed stem at ' + writtenID);
        }
        const rect = screenNote.getBoundingClientRect();
        return { direction: event.marks.find(m => m.kind === 'stem')?.value,
          screen: geometry(screen, screenNote), print: geometry(paper, printNote),
          clip: { x: Math.max(0, rect.x - 155), y: Math.max(0, rect.y - 40), width: 390, height: 125 } };
      }, { ...c, text: imported.documents[0].text });
      assert.equal(proof.direction, 'up');
      for (const surface of [proof.screen, proof.print]) {
        assert.ok(surface.rise > 15 && surface.attachment > 7, JSON.stringify(surface));
      }
      await page.screenshot({ path: resolve(out, c.id + '.png'), clip: proof.clip });
      console.log(c.id, proof.screen, proof.print);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
