// Reparse a complete movement imported from the full original archive and compare each measured attack.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseScore } from '../../dist/score.cjs';
import { importMXL } from '../../importer/dist/mxl.js';

const expected = JSON.parse(execFileSync('python3', ['issues/210/movement-oracle.py'], { encoding: 'utf8' }));
const file = readFileSync(new URL('fixtures/haydn.mxl', import.meta.url));
const selection = { firstMeasure: 129, lastMeasure: 237 };
const expressive = process.argv.includes('--expressive');
const options = { mode: 'partial', targetProfile: expressive ? 'expressive' : 'extended', capacity: 'large' };
const imported = await importMXL(file, { ...options, selection });
assert.equal(imported.status, 'partial', JSON.stringify(imported.diagnostics.at(-1)));
const document = imported.documents[0];
const score = parseScore(document.text, { capacity: 'large' });
assert.equal(score.parts.length, 4);
if (expressive) {
  const marks = score.parts.flatMap((p) =>
    p.staves.flatMap((s) => s.voices.flatMap((v) => v.events.flatMap((e) => e.marks))),
  );
  assert.equal(marks.filter((m) => m.kind === 'grace').flatMap((m) => m.pitches).length, 18);
  assert.ok(
    imported.diagnostics.some(
      (d) => d.part === 'P1' && d.measure === '15' && d.message.includes('unmatched slur'),
    ),
  );
} else assert.equal(imported.diagnostics.filter((d) => d.message === 'Omitted MusicXML grace.').length, 18);
let observed = 0;
for (const [p, part] of score.parts.entries()) {
  assert.equal(part.measureCount, 109);
  const staff = part.staves[0];
  for (const [v, voice] of staff.voices.entries()) {
    const id = document.staves[p].voices[v].source;
    const rows = voice.measures.flatMap((m, i) =>
      voice.events
        .slice(m.start, m.end)
        .filter((e) => e.kind !== 'skip')
        .map((e) => [i + 1, e.at, e.duration, e.heads.map((h) => h.pitch.replace('n', ''))]),
    );
    assert.deepEqual(rows, expected[p][id], part.name + ' voice ' + id);
    observed += rows.length;
  }
}
assert.equal(observed, 1990);
const partOnly = await importMXL(file, { ...options, selection: { ...selection, parts: ['P4'] } });
assert.equal(partOnly.documents[0].staves.length, 1);
assert.equal(partOnly.documents[0].staves[0].part, 'P4');
const cello = parseScore(partOnly.documents[0].text, { capacity: 'large' });
assert.equal(cello.parts[0].measureCount, 109);
assert.deepEqual(cello.playback.tempos, score.playback.tempos);
console.log(
  'Complete Haydn movement II: 4 parts × 109 measures, ' +
    observed +
    ' pitched attacks/visible rests agree in onset, duration and ordered spellings. Also verified the selected cello part.',
);
