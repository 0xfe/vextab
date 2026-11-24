// Verify the complete fugue's engraved stem and tie directions against native LilyPond 2.26.0.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { importLilyPond } from '../../importer/dist/lilypond.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const original = readFileSync(resolve(root, 'issues/212/complex-lilypond/bwv846.ly'), 'utf8');
const imported = importLilyPond(original, { targetProfile: 'expressive', mode: 'partial', score: 'print' });
assert.equal(imported.status, 'partial');
const source = imported.documents[0].text;
const expected = 'a34ab20ac99a799e4bb68007b64726e450b7546aeaad171a7a734ec129337bcf';
const native = process.argv.includes('--native')
  ? execFileSync('python3', [resolve(root, 'issues/219/lilypond-directions.py')], {encoding:'utf8'}) : undefined;
const browser = await chromium.launch(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel:'chrome' });
try {
  const page = await browser.newPage();
  await page.setContent('<main></main>');
  await page.addScriptTag({ path: resolve('node_modules/vexflow/build/cjs/vexflow.js') });
  await page.addScriptTag({path:resolve(root,'dist/main.dev.js')});
  const result = await page.evaluate(source => {
    const model = window.vextab.parseScore(source);
    const view = window.vextab.renderConductor(document.querySelector('main'), model, { width:820 });
    const names = ['soprane','tenor','alt','bass'], origins = new Map(), rows = [];
    const notes = new Map(view.navigation.events.map(e => [e.source, view.composition.getNote(e.id)]));
    const voices = model.parts[0].staves.flatMap(staff => staff.voices);
    for (const [i,voice] of voices.entries()) for (const event of voice.events) {
      // The fugue has 27 complete 4/4 bars. Both engines report absolute written onsets.
      const [n,d] = event.at.split('/').map(Number);
      const tick = (event.bar-1 + n/d) * 1536;
      const origin = names[i] + '\t' + tick;
      origins.set(event.id, origin);
      if (event.kind === 'attack' && notes.get(event.id).hasStem())
        rows.push(origin + '\tstem\t' + notes.get(event.id).getStemDirection());
    }
    // Resolve each fragment back to its written start. A broken tie repeats one logical record.
    const ties = new Map(view.score.ties.map(tie => [tie.id, origins.get(tie.from)]));
    const tied = new Set();
    for (const fragment of view.composition.sheet.getContinuousLayout().fragments) if (fragment.kind === 'tie') {
      const origin = ties.get(view.sourceFor(fragment.id));
      if (!origin) throw Error('Missing source for ' + fragment.id);
      tied.add(origin + '\ttie\t' + (fragment.above ? 1 : -1));
    }
    // Stems inside a beam are siblings of the note groups in the SVG. Record native IDs when the
    // publication draws each note, then read the direction of the actual path on the finished page.
    const notePrototype = Object.getPrototypeOf([...notes.values()].find(note => note.hasStem()));
    const draw = notePrototype.draw, stemOwners = new Map();
    notePrototype.draw = function (...args) {
      if (!this.isRest() && this.hasStem()) stemOwners.set(this.getStem().getAttribute('id'), this.getAttribute('id'));
      return draw.apply(this,args);
    };
    const aside = document.body.appendChild(document.createElement('aside'));
    let print;
    try { print = window.vextab.renderEdition(aside,model,'conductor'); }
    finally { notePrototype.draw = draw; }
    const printed = [];
    for (const group of aside.querySelectorAll('.vf-stem[data-vf-id]')) {
      const path = group.querySelector('path');
      if (!path) continue;
      const stemId = group.getAttribute('data-vf-id').replace(/^vf-/,'');
      const origin = origins.get(print.sourceFor(stemOwners.get(stemId)));
      if (!origin) throw Error('Missing source for printed stem ' + stemId);
      const direction = Math.sign(path.getPointAtLength(0).y - path.getPointAtLength(path.getTotalLength()).y);
      printed.push(origin + '\tstem\t' + direction);
    }
    return { screen:[...rows,...tied].sort().join('\n') + '\n', print:printed.sort() };
  },source);
  const rows = result.screen.trimEnd().split('\n');
  assert.equal(rows.length,834);
  if (native !== undefined) assert.deepEqual(rows, native.trimEnd().split('\n'));
  assert.equal(createHash('sha256').update(result.screen).digest('hex'),expected);
  assert.deepEqual(result.print,rows.filter(row => row.includes('\tstem\t')));
  console.log('781 screen and printed stem directions and 53 screen tie sides match native LilyPond.');
} finally { await browser.close(); }
