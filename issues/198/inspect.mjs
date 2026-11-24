// Export both paper sizes for the quartet and four players, then reopen each outlined SVG offline.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const out = resolve('build/vt6-m3');
const source = await readFile('guide/scores/haydn-emperor-variation.vextab', 'utf8');
await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' });
try {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage(), print = await context.newPage();
  await page.setContent('<div id="score"></div>');
  await page.addScriptTag({ path: resolve('node_modules/vexflow/build/cjs/vexflow.js') });
  await page.addScriptTag({ path: resolve(process.argv[2] ?? 'dist/main.dev.js') });
  await page.addScriptTag({ path: resolve('node_modules/opentype.js/dist/opentype.min.js') });
  const fonts = [];
  for (const [family, weight, filename] of [['Bravura', 'normal', 'bravura/bravura'], ['Academico', 'normal', 'academico/academico'],
    ['Academico', 'bold', 'academico/academico-bold']]) {
    fonts.push({ family, weight, data: (await readFile('node_modules/@vexflow-fonts/' + filename + '.otf')).toString('base64') });
  }
  await page.evaluate(async fonts => {
    window.faces = fonts.map(({ family, weight, data }) => ({
      family, weight, font: window.opentype.parse(Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer),
    }));
    for (const { family, weight, data } of fonts) {
      const face = new FontFace(family, Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer, { weight });
      document.fonts.add(await face.load());
    }
    await document.fonts.ready;
  }, fonts);
  for (const target of ['conductor', 'violin_i', 'violin_ii', 'viola', 'cello']) for (const paper of ['A4', 'Letter']) {
    const name = target + '-' + paper;
    console.log(name);
    const result = await page.evaluate(({ source, target, paper }) => {
      const vt = window.vextab, doc = vt.parseScore(source);
      const view = vt.renderEdition(document.querySelector('#score'), doc, target === 'conductor' ? target : { partId: target }, { paper });
      const p = view.publication;
      if (view.diagnostics.length) throw new Error(JSON.stringify(view.diagnostics));
      // Trace the printed principal voice and each cue head to the independently checked edition.
      const written = new Map(doc.parts.flatMap(part => part.staves[0].voices[0].events.map(e => [e.id, e])));
      const seen = new Set();
      const players = target === 'conductor' ? doc.parts : doc.parts.filter(part => part.id === target);
      const expected = players.flatMap(part => part.staves[0].voices[0].events);
      function checkEvent(printed) {
        const id = view.sourceFor(printed.id), event = written.get(id);
        const keys = event.heads.map(h => h.pitch.slice(0, -1).toLowerCase() + '/' + h.pitch.slice(-1));
        const [n, d] = event.duration.split('/').map(Number);
        const [ticks, divisor] = printed.ticks.split('/').map(Number);
        if (n * divisor * 16384 !== ticks * d || printed.rest !== (event.kind === 'rest') ||
            (!printed.rest && JSON.stringify(keys) !== JSON.stringify(printed.keys)))
          throw Error('Printed pitch, duration or rest differs at ' + id);
        return id;
      }
      const pages = p.pages.map(({ number, svg, systems }) => {
        const meta = JSON.parse(svg.querySelector('metadata').textContent);
        for (const event of meta.events) seen.add(checkEvent(event));
        for (const cue of meta.regions) cue.events.forEach(checkEvent);
        const furniture = Array.from(svg.querySelector('[data-page-furniture]').children, e => e.textContent);
        if (!furniture.includes(String(number)) || !furniture.includes('Theme and Variation I') ||
            !furniture.includes(number === 1 ? 'Emperor Quartet' : 'Haydn · Op. 76 No. 3')) throw Error('Missing page furniture');
        for (const system of systems) if (system.x < 15 || system.x + system.width > p.paper.width - 15 ||
          system.y < 15 || system.y + system.height > p.paper.height - 16) throw Error('Music outside margins');
        return { measures: meta.measures, svg: p.toSVG(number, window.faces) };
      });
      if (seen.size !== expected.length || expected.some(e => !seen.has(e.id))) throw Error('Missing performing events');
      return { pages, html: p.toPrintHTML(window.faces) };
    }, { source, target, paper });
    assert.deepEqual(result.pages.flatMap(p => p.measures), Array.from({ length: 42 }, (_, i) => i + 1));
    await print.goto('about:blank');
    await print.setContent(result.html);
    await print.pdf({ path: join(out, name + '.pdf'), preferCSSPageSize: true, printBackground: true, tagged: false });
    for (const [i, p] of result.pages.entries()) {
      const file = join(out, name + '-' + (i + 1) + '.svg');
      await writeFile(file, p.svg);
      await print.goto(pathToFileURL(file).href);
      assert.equal(await print.locator('svg text').count(), 0);
      assert.ok(await print.locator('svg path').count() > 10);
    }
    console.log(name, result.pages.map(p => p.measures[0]).join(', '));
  }
} finally { await browser.close(); }
