// Independently generate bars on an integer eighth-note grid and compare both public conversions.
import assert from 'node:assert/strict';
import { parseScore } from 'vextab/parse';
import { importMusicXML } from '../../importer/dist/musicxml.js';
import { importLilyPond } from '../../importer/dist/lilypond.js';
import { importMXL } from '../../importer/dist/mxl.js';
import { readFileSync } from 'node:fs';

const steps = 'CDEFGAB';
const names = { 1: 'eighth', 2: 'quarter', 4: 'half', 8: 'whole' };

/** Convert eighths to the canonical whole-note fractions expected from the public parser. */
function fraction(ticks) {
  let divisor = 8;
  while (ticks % divisor) divisor /= 2;
  return ticks / divisor + '/' + 8 / divisor;
}

/** Use the same reproducible choices for two source encodings and a separate expected event list. */
function generate(seed) {
  let state = seed;
  function choose(length) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return Math.floor((length * state) / 2 ** 32);
  }
  const xml = [],
    ly = [],
    expected = [];
  for (let bar = 1; bar <= 5; bar++) {
    const notes = [];
    for (let at = 0; at < 8; ) {
      const durations = [1, 2, 4, 8].filter((n) => at + n <= 8);
      const ticks = durations[choose(durations.length)];
      const rest = choose(5) === 0;
      const pitch = steps[choose(steps.length)];
      notes.push(
        '<note>' +
          (rest ? '<rest/>' : '<pitch><step>' + pitch + '</step><octave>4</octave></pitch>') +
          '<duration>' +
          ticks +
          '</duration><type>' +
          names[ticks] +
          '</type></note>',
      );
      ly.push((rest ? 'r' : pitch.toLowerCase() + "'") + 8 / ticks);
      expected.push([bar, fraction(at), fraction(ticks), rest ? 'rest' : pitch + '4']);
      at += ticks;
    }
    ly.push('|');
    const attributes =
      '<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';
    xml.push(
      '<measure number="' + bar + '">' + (bar === 1 ? attributes : '') + notes.join('') + '</measure>',
    );
  }
  return {
    xml:
      '<score-partwise version="4.0"><part-list><score-part id="P"><part-name/></score-part></part-list><part id="P">' +
      xml.join('') +
      '</part></score-partwise>',
    ly: '\\new Staff { \\time 4/4 ' + ly.join(' ') + ' }',
    expected,
  };
}

/** Failures must remain bounded, located and atomic even in permissive mode. */
function checkFailure(result, length) {
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.documents, []);
  const error = result.diagnostics.at(-1);
  assert.equal(error.severity, 'error');
  assert.ok(
    error.range[0] >= 0 && error.range[0] <= error.range[1] && error.range[1] <= length,
    JSON.stringify(error),
  );
}
for (let seed = 1; seed <= 64; seed++) {
  const { xml, ly, expected } = generate(seed);
  for (const [source, convert] of [
    [xml, importMusicXML],
    [ly, importLilyPond],
  ]) {
    const result = convert(source, { sourceMap: true });
    assert.equal(result.status, 'exact', JSON.stringify(result.diagnostics));
    const document = result.documents[0];
    const voice = parseScore(document.text).parts[0].staves[0].voices[0];
    assert.deepEqual(
      voice.events.map((e) => [e.bar, e.at, e.duration, e.heads[0]?.pitch ?? e.kind]),
      expected,
    );
    for (const map of document.sourceMap) {
      assert.ok(source.slice(...map.original).length && document.text.slice(...map.generated).length);
    }
    // Cut inside a known required delimiter. Vary the prefix of the complete expression.
    const from = source.indexOf(source === xml ? '<note>' : '4/4') + 2;
    const end = from + (seed % (source.length - from - 1));
    const prefix = source.slice(0, end);
    for (const mode of ['strict', 'partial']) checkFailure(convert(prefix, { mode }), prefix.length);
  }
}
// Both readers use the same counted-repeat writer. The written body occurs exactly once.
const counted = importLilyPond("{ \\repeat volta 5 { c'1 } d'1 }", { targetProfile: 'expressive' });
assert.equal(counted.status, 'exact');
assert.equal(counted.target.minimumVersion, '6.5.0');
assert.match(counted.documents[0].text, /repeatCount 5/);
const repeatedVoice = parseScore(counted.documents[0].text).parts[0].staves[0].voices[0];
assert.equal(repeatedVoice.measures.length, 2);
assert.equal(repeatedVoice.repeats[0].count, 5);

const archive = readFileSync(new URL('../208/fixtures/deflated.mxl', import.meta.url));
for (const end of [0, 1, 22, Math.floor(archive.length / 2), archive.length - 1]) {
  checkFailure(await importMXL(archive.subarray(0, end)), end);
}
// Test public readers at the input boundary, including combined virtual-file size for LilyPond.
for (const [convert, source] of [
  [importMusicXML, generate(1).xml],
  [importLilyPond, generate(1).ly],
]) {
  const padded = source.padEnd(1024 * 1024);
  assert.equal(convert(padded).status, 'exact');
  const tooLarge = convert(padded + ' ');
  checkFailure(tooLarge, padded.length + 1);
  assert.equal(tooLarge.diagnostics.at(-1).code, 'limit');
}
console.log('64 paired five-bar scores, 256 incomplete sources, and five truncated archives passed.');
