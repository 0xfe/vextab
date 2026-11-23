// Check real, unchanged files from the MuseScore regression suite and the music21 score collection.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseScore } from '../../dist/score.cjs';
import { importMusicXML } from '../../importer/dist/musicxml.js';

const manifest = JSON.parse(readFileSync(new URL('exporters.json', import.meta.url), 'utf8'));
function fixture(name, selection, expectedFailure = false) {
  const record = manifest.find((f) => f.file === name);
  const bytes = readFileSync('build/importer-m3/' + name);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
  const xml = bytes.toString();
  assert.ok(xml.includes('<software>' + record.exporter + '</software>'));
  const result = importMusicXML(bytes, { mode: 'partial', targetProfile: 'extended', selection, filename: name });
  if (expectedFailure) {
    assert.equal(result.status, 'failed');
    return { xml, diagnostics: result.diagnostics };
  }
  assert.equal(result.status, 'partial', JSON.stringify(result.diagnostics.at(-1)));
  return { score: parseScore(result.documents[0].text), diagnostics: result.diagnostics, xml };
}

const clarinet = fixture('testChangeTranspose.xml').score.parts[0].staves[0];
assert.deepEqual(
  clarinet.staffChanges.filter((c) => c.sounds !== undefined).map((c) => [c.bar, c.at, c.sounds]),
  [
    [1, '0/1', -3],
    [4, '0/1', -2],
  ],
);
assert.deepEqual(
  clarinet.voices[0].events.flatMap((e) => e.heads.map((h) => h.pitch)),
  ['C5', 'C#5'],
);

const mixed = fixture('testTuplets1.xml').score.parts[0].staves[0].voices[0];
assert.equal(mixed.measures.length, 7);
assert.deepEqual(
  mixed.events.slice(0, 5).map((e) => e.duration),
  ['1/4', '1/6', '1/6', '1/6', '1/4'],
);
assert.deepEqual(
  mixed.events.slice(6, 11).map((e) => e.duration),
  Array(5).fill('1/10'),
);
// The source declares 9:8 sixteenths but encodes rounded durations in divisions of 256.
const incomplete = fixture('testIncompleteTuplet.xml', undefined, true);
const failure = incomplete.diagnostics.at(-1);
assert.deepEqual([failure.part, failure.measure, failure.voice], ['P1', '2', '1']);
assert.match(failure.message, /Written value disagrees with elapsed/);
assert.ok(incomplete.xml.slice(...failure.range).includes('<duration>56</duration>'));
const lyric = fixture('testLyricsVoice2a.xml');
const syllables = lyric.diagnostics.filter((d) => d.voice === '2' && d.message === 'Omitted MusicXML lyric.');
assert.deepEqual(
  syllables.map((d) => lyric.xml.slice(...d.range).match(/<text>(.*?)<\/text>/u)[1]),
  ['Here', 'in', 'voice', '2 !'],
);
assert.deepEqual(
  lyric.score.parts[1].staves[0].voices[1].events.map((e) => e.heads[0].pitch),
  ['G3', 'A3', 'B3', 'C4'],
);
const tab = fixture('testTablature1.xml');
assert.ok(tab.diagnostics.some((d) => d.message.includes('Converted TAB to pitched staff')));
assert.deepEqual(
  tab.score.parts[0].staves[0].voices[0].events.map((e) => e.heads[0].pitch),
  ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
);

const beach = fixture('prayer_of_a_tired_child.musicxml', { parts: ['P1'], firstMeasure: 1, lastMeasure: 6 });
const singer = beach.score.parts[0].staves[0].voices[0];
assert.equal(singer.measures.length, 6);
assert.deepEqual(
  singer.events.slice(-8).map((e) => e.heads[0].pitch),
  ['G4', 'Ab4', 'G4', 'Gb4', 'F4', 'C5', 'C5', 'C5'],
);
console.log('Five pinned MuseScore 0.7.0 regressions and the Finale v25 MusicXML 3.1 soprano passage passed.');
