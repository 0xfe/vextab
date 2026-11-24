// Check native VexFlow screen and print observations, then export white-background evidence.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { nativeControls } from './native.mjs';

const out = 'build/importer-m0';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 840, height: 520 } });
  await page.setContent('<style>body{background:white}main{width:750px}</style><main></main><aside></aside>');
  await page.addScriptTag({ path: resolve('node_modules/vexflow/build/cjs/vexflow.js') });
  await page.addScriptTag({ path: resolve('node_modules/opentype.js/dist/opentype.min.js') });
  const fonts = [];
  for (const [family, file] of [['Bravura', 'bravura'], ['Academico', 'academico']]) {
    const bytes = await readFile('node_modules/@vexflow-fonts/' + file + '/' + file + '.otf');
    fonts.push({ family, data: bytes.toString('base64') });
  }
  await page.evaluate(async fonts => {
    window.faces = [];
    for (const { family, data } of fonts) {
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      document.fonts.add(await new FontFace(family, bytes).load());
      window.faces.push({ family, font: opentype.parse(bytes.buffer) });
    }
    VexFlow.setFonts('Bravura', 'Academico');
  }, fonts);
  const { html, ...report } = await page.evaluate(nativeControls);
  console.log(report);
  assert.equal(report.version, '5.9.0');
  assert.deepEqual(report.diagnostics, []);
  assert.deepEqual(report.changes, ['StaveNote', 'ClefNote', 'KeySigNote', 'StaveNote']);
  assert.ok(report.printedChanges.includes('e062') && report.printedChanges.includes('e262'));
  assert.equal(report.written, 'h');
  assert.equal(report.dots, 1);
  const [ticks, divisor] = report.hiddenTicks.split('/').map(Number);
  assert.ok(report.rest && ticks / divisor === 16384 * 5 / 8);
  for (const [a, b] of [report.screenX, report.printX]) assert.ok(Math.abs(a - b) < 0.1);
  assert.deepEqual(report.systems, [[1, 2, 3], [4]]);
  assert.deepEqual(report.printedSpans, ['phrase1/first', 'phrase1/last', 'phrase2/first', 'phrase2/last']);
  assert.deepEqual(report.printedSpans, report.screenSpans);
  await page.locator('main').screenshot({ path: out + '/screen.png' });
  const paper = await browser.newPage();
  await paper.setContent(html);
  await paper.pdf({ path: out + '/part.pdf', printBackground: true, preferCSSPageSize: true });
  await writeFile(out + '/native.json', JSON.stringify(report, null, 2) + '\n');
} finally { await browser.close(); }
