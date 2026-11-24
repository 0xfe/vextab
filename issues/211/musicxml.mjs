// Verify original corpus files against independently known musical observations in the public VexTab model.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseScore } from '../../dist/score.cjs';
import { importMusicXML } from '../../importer/dist/musicxml.js';

const options = { mode: 'partial', targetProfile: 'expressive' };
const digests = new Map(
  readFileSync(new URL('xml/SHA256SUMS', import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .map((line) => line.split(/\s+/).reverse()),
);
const exporters = JSON.parse(readFileSync(new URL('../210/exporters.json', import.meta.url), 'utf8'));
function read(name, selection, failed = false) {
  const upstream = exporters.find((source) => source.file === name);
  const file = upstream ? 'build/importer-m3/' + name : new URL('xml/' + name, import.meta.url);
  const source = readFileSync(file);
  assert.equal(createHash('sha256').update(source).digest('hex'), upstream?.sha256 ?? digests.get(name));
  const result = importMusicXML(source, { ...options, selection, filename: name });
  if (failed) {
    assert.equal(result.status, 'failed');
    const error = result.diagnostics.at(-1);
    return { error, source: source.toString().slice(...error.range) };
  }
  assert.equal(result.status, 'partial', JSON.stringify(result.diagnostics.at(-1)));
  return { score: parseScore(result.documents[0].text), warnings: result.diagnostics };
}
const slurs = read('33g-Slur-ChordedNotes.musicxml').score.parts[0].staves[0].voices[0];
assert.deepEqual(
  slurs.spans.map((s) => [
    s.kind,
    s.side,
    slurs.events.findIndex((e) => e.id === s.first),
    slurs.events.findIndex((e) => e.id === s.last),
  ]),
  [
    ['slur', 'above', 0, 2],
    ['slur', 'below', 1, 3],
  ],
);
const sung = read('61j-Lyrics-Elisions.musicxml');
assert.deepEqual(
  sung.score.parts[0].staves[0].voices[0].events.map((e) => [e.marks[0].text, e.marks[0].elideWith]),
  [
    ['a', undefined],
    ['b c', undefined],
    ['d', 'e'],
    ['f', 'g h'],
  ],
);
assert.ok(sung.warnings.some((d) => d.message.includes('two elided syllables')));
const guitar = read('71e-TabStaves.musicxml', { parts: ['P1'] }).score.parts[0];
assert.equal(guitar.kind, 'guitar');
assert.equal(guitar.view, 'tab');
const fretted = guitar.staves[0].voices[0].events;
assert.deepEqual(
  fretted[4].heads.map((h) => [h.string, h.fret, h.marks.find((m) => m.kind === 'write').pitch]),
  [
    [6, 4, 'G#2'],
    [4, 4, 'F#3'],
    [3, 0, 'G3'],
  ],
);
const diagrams = read('71c-ChordsFrets.musicxml');
const melody = diagrams.score.parts[0].staves[0].voices[0].events;
assert.deepEqual(
  melody.map((e) => e.heads.map((h) => h.pitch)),
  Array.from({ length: 8 }, () => ['A4']),
);
assert.deepEqual(melody[0].marks.find((m) => m.kind === 'diagram').frets, [0, 3, 2, 0, 1, 0]);
assert.equal(melody[1].marks.find((m) => m.kind === 'harmony').quality, 'maj7(add#11)');
assert.ok(diagrams.warnings.some((d) => d.message.includes('four to eight strings')));
const percussion = read('73a-Percussion.musicxml', undefined, true);
assert.match(percussion.error.message, /declared midi-unpitched/);
assert.match(percussion.source, /^<unpitched>/);
const muse = read('testLyricsVoice2a.xml').score.parts[1].staves[0].voices;
assert.equal(muse[0].events[0].kind, 'rest');
assert.deepEqual(
  muse[1].events.map((e) => [e.at, e.heads[0].pitch, e.marks.find((m) => m.kind === 'lyric').text]),
  [
    ['0/1', 'G3', 'Here'],
    ['1/4', 'A3', 'in'],
    ['1/2', 'B3', 'voice'],
    ['3/4', 'C4', '2 !'],
  ],
);
const contradictory = read('testTablature1.xml', undefined, true);
assert.match(contradictory.error.message, /disagree with the declared sounding pitch/);
assert.match(contradictory.source, /<string>6<\/string>/);
const finale = read('prayer_of_a_tired_child.musicxml', { parts: ['P1'], firstMeasure: 1, lastMeasure: 6 }).score
  .parts[0].staves[0].voices[0];
const prayer = finale.events.find((e) => e.marks.some((m) => m.kind === 'lyric' && m.text === 'prayer,'));
assert.equal(prayer.marks.find((m) => m.kind === 'lyric').extend, 2);
const slur = finale.spans.find((s) => s.kind === 'slur' && s.first === prayer.id);
assert.equal(slur.side, 'below');
assert.equal(
  finale.events.findIndex((e) => e.id === slur.last),
  finale.events.indexOf(prayer) + 2,
);
assert.ok(finale.events[2].marks.some((m) => m.kind === 'dynamic' && m.value === 'pp'));
console.log('Verified five W3C expressive fixtures, two MuseScore regressions and the Finale soprano passage.');
