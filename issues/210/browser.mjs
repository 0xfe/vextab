// Open an imported quartet movement in the editor, conductor, player and print renderer.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { importMXL } from '../../importer/dist/mxl.js';
import { importMusicXML } from '../../importer/dist/musicxml.js';

const output = resolve('build/importer-m3');
await mkdir(output, { recursive: true });
const options = { targetProfile: 'extended', capacity: 'large', mode: 'partial' };
const source = await readFile(new URL('fixtures/haydn.mxl', import.meta.url));
const movement = await importMXL(source, { ...options, selection: { firstMeasure: 129, lastMeasure: 237 } });
const control = importMusicXML(await readFile(new URL('ensemble.musicxml', import.meta.url)), options);
for (const result of [movement, control]) {
  assert.ok(result.documents.length, JSON.stringify(result.diagnostics.slice(-1)));
}
const browser = await chromium.launch(process.env.CHROME_BIN ? {executablePath: process.env.CHROME_BIN} : {channel: 'chrome'});

/** A fixed viewport and a white page provide comparable on-screen evidence. */
async function openScore(title) {
  const page = await browser.newPage({viewport: {width: 1120, height: 760}});
  await page.setContent('<style>body{margin:20px;color:#222;background:white;font:16px system-ui}h2{font-size:20px;margin:0 0 12px}</style><h2></h2><main></main><aside></aside>');
  await page.locator('h2').evaluate((node, label) => { node.textContent = label; }, title);
  await page.addScriptTag({path: resolve('dist/main.dev.js')});
  return page;
}

try {
  const page = await openScore('Haydn · Emperor Quartet, movement II');
  // A short score with a long author comment isolates the editor's byte gate from rendering cost.
  const hostGate = await page.evaluate(() => {
    const text = '// ' + 'a'.repeat(65536) + '\nstaff { :w C4 | }';
    function mount(capacity, options) {
      const host = document.body.appendChild(document.createElement('div'));
      if (capacity) host.dataset.capacity = capacity;
      host.dataset.showErrors = 'true';
      host.textContent = text;
      const editor = new window.vextab.Div(host, options);
      const ok = Boolean(editor.getScore());
      editor.dispose();
      host.remove();
      return ok;
    }
    return [mount(undefined, {}), mount('large', {}), mount(undefined, {capacity:'large'}),
      new window.vextab.VexTab({capacity:'large'}).parse(text).parts[0].measureCount];
  });
  assert.deepEqual(hostGate, [false,true,true,1]);
  const report = await page.evaluate(async text => {
    const vt = window.vextab;
    const root = document.querySelector('main');
    root.dataset.capacity = 'large';
    root.dataset.editor = 'true';
    root.dataset.view = 'conductor';
    root.textContent = text;
    const start = performance.now();
    const editor = new vt.Div(root, {player: false});
    if (!editor.getScore() || !root.querySelector('svg')) throw Error('Conductor did not render');
    const openMs = performance.now() - start;
    const field = root.querySelector('textarea');
    field.value += '\n// edited revision';
    editor.run();
    const doc = editor.getScoreDocument();
    if (doc.source !== field.value || !editor.getScore()) throw Error('Editor did not render the edited revision');
    const heard = [];
    let signal;
    const firstSound = new Promise(ready => { signal = ready; });
    const player = new vt.Player(doc, {playback: {open: () => ({
      playNote(note) { heard.push(note.pitch); signal(); }, stop() {},
    })}});
    const playing = player.play();
    try {
      await Promise.race([firstSound, playing.then(() => { throw Error('No pitched movement events played'); })]);
    } finally { player.stop(); await playing; player.dispose(); }

    const printed = vt.renderEdition(document.querySelector('aside'), doc, {partIndex: 0});
    if (printed.diagnostics.length) throw Error(JSON.stringify(printed.diagnostics));
    const bars = printed.publication.pages.flatMap(page =>
      JSON.parse(page.svg.querySelector('metadata').textContent).measures);
    const svg = root.querySelector('svg');
    field.style.display = 'none';
    return {parts: doc.parts.map(p => p.measureCount), bars, heard,
      openMs: Math.round(openMs), pages: printed.publication.pages.length, noteheads: svg.querySelectorAll('.vf-notehead').length};
  }, movement.documents[0].text);
  assert.deepEqual(report.parts, [109,109,109,109]);
  assert.deepEqual(report.bars, Array.from({length:109}, (_, i) => i + 1));
  assert.ok(report.heard.length && report.noteheads > 1000 && report.pages > 1);
  console.log('Edited and played Haydn II, 109 bars × 4 parts. First violin print pages:', report.pages,
    'conductor noteheads:', report.noteheads, 'open ms:', report.openMs);
  await page.screenshot({path: resolve(output, 'movement.png'), clip: {x:0,y:0,width:1120,height:590}});
  await page.close();

  const example = await openScore('Clarinet and violin · written and sounding pitch');
  const evidence = await example.evaluate(async text => {
    const vt = window.vextab;
    const model = new vt.VexTab({capacity:'large'}).parse(text);
    const root = document.querySelector('main');
    root.textContent = text;
    const editor = new vt.Div(root, {view:'conductor', player:false});
    if (!editor.getScore()) throw Error('Missing conductor projection');
    const printed = vt.renderEdition(document.querySelector('aside'), model, {partIndex:0});
    if (printed.diagnostics.length) throw Error(JSON.stringify(printed.diagnostics));
    const svg = printed.publication.pages[0].svg;
    const meta = JSON.parse(svg.querySelector('metadata').textContent);
    // Both the changed bass clef and the sharp signature must lie between the written attacks.
    function inlineGlyphs(surface) {
      const heads = [...surface.querySelectorAll('.vf-notehead')].map(n => n.getBoundingClientRect());
      const left = Math.min(...heads.map(h => h.right)), right = Math.max(...heads.map(h => h.left));
      return [...surface.querySelectorAll('text')].filter(n => {
        const rect = n.getBoundingClientRect();
        return rect.left > left && rect.right < right;
      }).map(n => n.textContent);
    }
    // The native continuous layout paints brackets as paired bracketTop/bracketBottom SMuFL glyphs.
    const conductorHost = document.createElement('div');
    document.body.appendChild(conductorHost);
    const conductor = vt.renderEdition(conductorHost, model, 'conductor');
    if (conductor.diagnostics.length) throw Error(JSON.stringify(conductor.diagnostics));
    const connectors = [root, conductor.publication.pages[0].svg, svg].map(surface =>
      [...surface.querySelectorAll('text')].map(n => n.textContent).join(''));
    conductorHost.remove();
    const notes = [];
    const player = new vt.Player(model, {partIndex:0, playback:{open: () => ({
      playNote(n) { notes.push([n.pitch, n.duration]); }, stop() {},
    })}});
    try { await player.play(); } finally { player.dispose(); }
    return {groups:model.groups, connectors, keys:meta.events.map(e => e.keys),
      screen:inlineGlyphs(root), paper:inlineGlyphs(svg), notes};
  }, control.documents[0].text);
  assert.equal(evidence.groups.length, 1);
  for (const glyph of ['\ue003','\ue004']) {
    assert.ok(evidence.connectors[0].includes(glyph) && evidence.connectors[1].includes(glyph));
    assert.ok(!evidence.connectors[2].includes(glyph), 'Single-instrument edition must omit the group bracket');
  }
  assert.deepEqual(evidence.keys, [['c/4'],['f#/4']]);
  assert.deepEqual(evidence.notes.map(([pitch]) => pitch), [58,64]);
  assert.ok(evidence.notes[1][1] > 1.8 * evidence.notes[0][1], 'Tempo change must lengthen the second half note');
  for (const glyphs of [evidence.screen, evidence.paper]) {
    for (const glyph of ['\ue062','\ue262']) assert.ok(glyphs.join('').includes(glyph), JSON.stringify(glyphs));
  }
  await example.screenshot({path:resolve(output, 'ensemble.png'), clip:{x:0,y:0,width:1120,height:570}});
  console.log('Confirmed printed written pitches, transposed playback, inline clef and key on screen and paper, and beat-three tempo.');
} finally { await browser.close(); }
