// Qualify each packaged repertoire score on both renderers, on a touch screen and in print.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright-core';

const dist = resolve(process.argv[2] ?? 'dist');
const out = resolve('build/vt6-m5');
const guide = pathToFileURL(join(dist, 'guide/index.html')).href;
const engine = process.env.VEXTAB_BROWSER ?? 'chromium';
const browser = await ({ chromium, firefox, webkit })[engine].launch(engine === 'chromium' ?
  (process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' }) : {});
const pieces = ['sor-op35-no22', 'joplin-maple-leaf', 'handy-st-louis-blues', 'haydn-emperor-variation'];
await mkdir(out, { recursive: true });

/** Compare musical events, native row assignments and downbeat positions on both backends. */
async function compareSurfaces(page, source) {
  const results = await page.evaluate(source => {
    const vt = window.vextab, score = vt.parseScore(source);
    return ['svg', 'canvas'].map(renderer => {
      const view = vt.renderConductor(document.getElementById('screen'), score, { width: 920, renderer });
      const rows = view.composition.sheet.getContinuousLayout().rows.map(row => row.measures);
      const notes = view.navigation.events.map(({ source, measure, voice, onset, duration }) => [source, measure, voice, onset, duration]);
      const offsets = view.composition.staves.map(staves => staves.map(s => s.getNoteStartX()));
      return { rows, notes, offsets, diagnostics: view.diagnostics.map(d => d.code) };
    });
  }, source);
  const [svg, canvas] = results;
  assert.deepEqual(canvas.notes, svg.notes);
  assert.deepEqual(canvas.rows, svg.rows);
  assert.deepEqual([svg.diagnostics, canvas.diagnostics], [[], []]);
  let maxOffset = 0;
  for (const [i, staves] of svg.offsets.entries()) for (const [j, x] of staves.entries())
    maxOffset = Math.max(maxOffset, Math.abs(x - canvas.offsets[i][j]));
  assert.ok(maxOffset < 2, 'Downbeat position differs by ' + maxOffset + ' CSS pixels');
  return { events: svg.notes.length, systems: svg.rows.length, maxOffset };
}

/** Tap real notehead ink. Measure displayed staff spacing independently of the device pixel ratio. */
async function checkPhone(id) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  try {
    await page.goto(guide + '#lesson/' + id);
    await page.evaluate(() => document.fonts.ready);
    const head = page.locator('#score .vf-notehead text').filter({ hasText: /[\ue0a0-\ue0af]/ }).first();
    await head.scrollIntoViewIfNeeded();
    // SVG text boxes include the font's full ascent. Tap the centre of the painted notehead.
    const point = await head.evaluate(el => {
      const ctx = document.createElement('canvas').getContext('2d'), style = getComputedStyle(el);
      ctx.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
      const ink = ctx.measureText(el.textContent);
      const x = Number(el.getAttribute('x')) + (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2;
      const y = Number(el.getAttribute('y')) + (ink.actualBoundingBoxDescent - ink.actualBoundingBoxAscent) / 2;
      const { x: left, y: top } = new DOMPoint(x, y).matrixTransform(el.getScreenCTM());
      return { x: left, y: top };
    });
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForFunction(() => {
      const input = document.querySelector('#score textarea');
      return input.selectionEnd > input.selectionStart;
    }, undefined, { timeout:3000 });
    const selected = await page.locator('#score textarea').evaluate(s => s.value.slice(s.selectionStart, s.selectionEnd));
    const expected = { 'sor-op35-no22':'3/2[finger 2]', 'joplin-maple-leaf':'(Eb3 Eb2)',
      'handy-st-louis-blues':'B4[grace before (A#4), verse first "I", verse second "Been", harmony G "7"]',
      'haydn-emperor-variation':'G4' };
    assert.equal(selected, expected[id]);
    const size = await page.locator('#score .vf-stave').first().evaluate(stave => {
      const lines = [...stave.querySelectorAll('path')].flatMap(path => {
        const a = path.getPointAtLength(0).matrixTransform(path.getScreenCTM());
        const b = path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM());
        return Math.abs(a.x - b.x) > 30 && Math.abs(a.y - b.y) < 1 ? [a.y] : [];
      });
      return { spacing: lines[1] - lines[0], overflow: document.documentElement.scrollWidth - innerWidth, dpr: devicePixelRatio };
    });
    assert.equal(size.dpr, 2);
    assert.ok(size.spacing >= 8 && size.overflow <= 1, JSON.stringify(size));
    if (id === pieces[0] && engine === 'chromium') {
      await page.locator('#view-controls').scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(out, 'sor-phone.png') });
    }
    return { ...size, selected };
  } finally { await page.close(); }
}

/** Reopen each guide download and send its outlined pages to the browser's print engine. */
async function printEditions(page, id) {
  await page.goto(guide + '#lesson/' + id);
  const results = [];
  const views = await page.locator('#view option').evaluateAll(items => items.map(o => o.value));
  const paperPage = await browser.newPage({ offline: true });
  try {
    for (const view of views) for (const paper of ['A4', 'Letter']) {
      await page.locator('#view').selectOption(view);
      await page.locator('#paper').selectOption(paper);
      await page.locator('#prepare-print').click();
      await page.waitForFunction(() => !document.querySelector('#save-print').disabled || document.querySelector('#print-status').textContent);
      assert.equal(await page.locator('#print-status').textContent(), '', id + ' ' + view + ' ' + paper);
      const saving = page.waitForEvent('download');
      await page.locator('#save-print').click();
      const html = await readFile(await (await saving).path(), 'utf8');
      await paperPage.setContent(html);
      const pages = paperPage.locator('body > svg');
      assert.ok(await pages.count());
      assert.equal(await pages.locator('text').count(), 0);
      const measures = await pages.locator('metadata').evaluateAll(items => items.flatMap(m => JSON.parse(m.textContent).measures));
      assert.deepEqual(measures, Array.from({ length: { 'sor-op35-no22':8, 'joplin-maple-leaf':18,
        'handy-st-louis-blues':12, 'haydn-emperor-variation':42 }[id] }, (_, i) => i + 1));
      const name = id + '-' + view.replace('/', '-') + '-' + paper;
      await paperPage.pdf({ path: join(out, name + '.pdf'), printBackground: true, preferCSSPageSize: true });
      results.push({ name, paper, pages: await pages.count() });
    }
  } finally { await paperPage.close(); }
  return results;
}

try {
  const page = await browser.newPage(), print = await browser.newPage();
  await page.setContent('<div id="screen"></div>');
  await page.addScriptTag({ path: resolve('node_modules/vexflow/build/cjs/vexflow.js') });
  await page.addScriptTag({ path: join(dist, 'main.prod.js') });
  await page.evaluate(async () => { await window.vextab.Vex.Flow.loadFonts('Bravura','Academico'); await document.fonts.ready; });
  const results = {};
  for (const piece of pieces) {
    const source = await readFile(join(dist, 'guide/scores', piece + '.vextab'), 'utf8');
    const surfaces = await compareSurfaces(page, source);
    const phone = await checkPhone(piece);
    const editions = engine === 'chromium' ? await printEditions(print, piece) : undefined;
    results[piece] = { surfaces, phone, editions };
    console.log(piece, surfaces, phone);
  }
  await writeFile(join(out, engine + '.json'), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
