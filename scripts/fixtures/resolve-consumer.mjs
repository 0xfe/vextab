// Exercise the installed headless ESM entry and export the fixtures for browser parity.
import assert from 'node:assert/strict';
// A worker may expose FontFace even when it has no document. Neither entry should request fonts.
let fontRequests = 0;
globalThis.FontFace = class {
  constructor() { fontRequests++; }
};
const { parseScore } = await import('vextab/parse');
const { resolvePart } = await import('vextab/resolve');

const melody = parseScore(`meter 4/4
transpose +2
staff lead {
  key G
  :h F4[harmony G "7" bass B] rest |
  break system
  :w C5 bar final
}`);
const lead = resolvePart(melody);
const [note, rest] = lead.measures[0].voices[0].events;
assert.deepEqual([note.heads[0].written, note.heads[0].sounding], ['g#/4', 'g#/4']);
assert.deepEqual(note.harmony, { root: 'A', quality: '7', bass: 'C#' });
assert.deepEqual([note.onset, note.duration, rest.onset, rest.duration], ['0/1', '1/2', '1/2', '1/2']);
assert.deepEqual(rest.heads, []);
assert.equal(lead.measures[1].voices[0].events[0].heads[0].sounding, 'd/5');

const duet = parseScore(`meter 2/4 pickup 1/4
staff cello { :q C3 | :h G3 | }
staff reed {
  sounds -2
  voice melody { :q D4 | D4[tie] tuplet 3:2 { :8 E4 F4 G4 } | }
  voice echo { :q rest | :h A4 | }
}`);
const reed = resolvePart(duet, { partId: 'reed' });
assert.equal(resolvePart(duet).instrument.id, 'cello');
assert.deepEqual(resolvePart(duet, { partIndex: 1 }), reed);
for (const invalid of [{ partId: 'viola' }, { partIndex: 2 }, { partId: 'reed', partIndex: 0 }]) {
  assert.throws(() => resolvePart(duet, invalid), RangeError);
}
const [pickup, full] = reed.measures;
assert.deepEqual([pickup.span, full.span], ['1/4', '1/2']);
assert.deepEqual(full.voices.map(voice => voice.name), ['melody', 'echo']);
const [held, ...triplet] = full.voices[0].events;
assert.deepEqual([held.heads[0].written, held.heads[0].sounding], ['d/4', 'c/4']);
assert.deepEqual(triplet.map(note => [note.onset, note.duration]), [['1/4', '1/12'], ['1/3', '1/12'], ['5/12', '1/12']]);
const tie = reed.ties[0];
assert.deepEqual([tie.from, tie.to, tie.fromHead, tie.toHead], [pickup.voices[0].events[0].id, held.id, 0, 0]);
assert.equal(duet.source.slice(held.range.start, held.range.end), 'D4[tie]');
const written = duet.parts[1].staves[0].voices[0];
assert.deepEqual(reed.measures.flatMap(bar => bar.voices[0].events.map(event => event.id)), written.events.map(event => event.id));

assert.equal(fontRequests, 0);

// Send the exact parsed revisions and their independently resolved models to the browser.
console.log(JSON.stringify([
  { document: melody, selector: {}, part: lead },
  { document: duet, selector: { partIndex: 1 }, part: reed },
]));
