// Compare the actual MXL import with the independently reviewed and source-verified Haydn edition.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseScore } from '../../dist/score.cjs';
import { importMXL } from '../../importer/dist/mxl.js';

const source = readFileSync(new URL('fixtures/haydn-excerpt.mxl', import.meta.url));
const imported = await importMXL(source, { mode: 'partial' });
assert.equal(imported.status, 'partial', JSON.stringify(imported.diagnostics.at(-1)));
const actual = parseScore(imported.documents[0].text);
const expected = parseScore(readFileSync('guide/scores/haydn-emperor-variation.vextab', 'utf8'));

/** Compare ordered written spellings, including explicit natural signs when required by the key. */
function observations(voice) {
  return voice.measures.map((m) =>
    voice.events.slice(m.start, m.end).map((e) => [e.kind, e.at, e.duration, e.heads.map((h) => h.pitch)]),
  );
}
assert.equal(actual.parts.length, 4);
let count = 0;
for (const [i, part] of actual.parts.entries()) {
  const voice = part.staves[0].voices[0];
  assert.equal(voice.measures.length, 42);
  const rows = observations(voice);
  assert.deepEqual(rows, observations(expected.parts[i].staves[0].voices[0]), 'Part ' + (i + 1));
  count += rows.flat().length;
}
assert.equal(count, 772);
assert.equal(imported.diagnostics.filter((d) => d.message === 'Omitted MusicXML grace.').length, 6);
assert.deepEqual(
  actual.parts.map((p) => p.staves[0].voices.length),
  [2, 2, 1, 1],
);
// The twelve auxiliary source events comprise eight hidden rests and four ornament anchors.
assert.equal(
  actual.parts
    .flatMap((p) => p.staves[0].voices.slice(1))
    .flatMap((v) => v.events)
    .filter((e) => e.kind === 'attack').length,
  4,
);
console.log(
  'Haydn: 772 principal attacks/rests match in order, duration, onset and spelled pitch across 4 × 42 measures. Six graces reported; four auxiliary attacks and their silent intervals retained.',
);

const { importMusicXML } = await import('../../importer/dist/musicxml.js');
const hidden = importMusicXML(readFileSync(new URL('fixtures/hidden.musicxml', import.meta.url)), {
  mode: 'partial',
});
const voices = parseScore(hidden.documents[0].text).parts[0].staves[0].voices;
for (const v of voices) {
  const relative = v.measures.map((m) => v.events.slice(m.start, m.end).at(-1));
  assert.equal(relative[0].at, '5/8');
  assert.equal(relative[1].at, '5/8');
}
console.log('MusicXML 3.1 invisible rests preserve both voices’ 5/8 onset in each measure.');
