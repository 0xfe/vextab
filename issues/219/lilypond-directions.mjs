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
    return [...rows,...tied].sort().join('\n') + '\n';
  },source);
  assert.equal(result.trimEnd().split('\n').length,834);
  if (native !== undefined) assert.deepEqual(result.split('\n'), native.split('\n'));
  assert.equal(createHash('sha256').update(result).digest('hex'),expected);
  console.log('781 native stem directions and 53 native tie sides match at their exact voice and onset.');
} finally { await browser.close(); }
