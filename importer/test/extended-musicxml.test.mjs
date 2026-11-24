// Verify target negotiation, carry-in and located failures without downloading any score.
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { importMusicXML } from 'vextab-import/musicxml';
import { importMXL } from 'vextab-import/mxl';
import { readFileSync } from 'node:fs';

const options = { targetProfile: 'extended', mode: 'partial' };
const note =
  '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>';
const attrs =
  '<attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>';
const bar = (number, content) => '<measure number="' + number + '">' + content + '</measure>';
const score = (first, second) =>
  '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>A</part-name></score-part><score-part id="P2"><part-name>B</part-name></score-part></part-list><part id="P1">' +
  first +
  '</part><part id="P2">' +
  second +
  '</part></score-partwise>';

test('a selected part inherits and rebases global tempos from an omitted staff', () => {
  const first = bar(1, attrs + note + '<sound tempo="82"/>' + note) + bar(2, note + '<sound tempo="72"/>' + note);
  const isolated = bar(1, attrs + note + note) + bar(2, note + note);
  const source = score(first, isolated);
  const result = importMusicXML(source, {
    ...options,
    selection: { firstMeasure: 2, lastMeasure: 2, parts: ['P2'] },
  });
  assert.match(result.documents[0].text, /tempo 82 at 1\n\s+tempo 72 at 1 \+ 1\/4/);
  assert.equal(result.target.minimumVersion, '6.3.0');
  // A direction's visual offset defaults to playback at the written cursor.
  const delayed = source.replace(
    '<sound tempo="72"/>',
    '<direction><offset>-1</offset><sound tempo="72"/></direction>',
  );
  assert.match(
    importMusicXML(delayed, { ...options, selection: { parts: ['P2'] } }).documents[0].text,
    /tempo 72 at 2 \+ 1\/4/,
  );
  const audible = delayed.replace('<offset>', '<offset sound="yes">');
  assert.match(
    importMusicXML(audible, { ...options, selection: { parts: ['P2'] } }).documents[0].text,
    /tempo 72 at 2\n/,
  );
});

test('selection cannot reinterpret a repeat that started before its first measure', () => {
  const first =
    bar(1, attrs + '<barline location="left"><repeat direction="forward"/></barline>' + note + note) +
    bar(2, note + note + '<barline><repeat direction="backward"/></barline>');
  const result = importMusicXML(score(first, first), {
    ...options,
    selection: { parts: ['P1'], firstMeasure: 2 },
  });
  assert.equal(result.status, 'failed');
  assert.match(result.diagnostics.at(-1).message, /selection begins inside a repeat/);
});

test('source and target capacity diagnostics identify the dimension', async () => {
  const f = readFileSync(new URL('../../issues/210/fixtures/haydn.mxl', import.meta.url));
  const d = (await importMXL(f)).diagnostics.at(-1);
  assert.equal(d.code, 'limit');
  assert.match(d.message, /4231200.*1048576/);
  assert.equal(importMusicXML(score('', ''), { capacity: 'large' }).diagnostics[0].code, 'limit');
});

test('an inline clef through a sustained voice fails at the clef; a silent voice can be split', () => {
  const clef = '<clef><sign>F</sign><line>4</line></clef>';
  const sustained = note
    .replace('type>quarter', 'type>half')
    .replace('duration>1', 'duration>2')
    .replace('<type>', '<voice>2</voice><type>');
  const mid = attrs + note + '<attributes>' + clef + '</attributes>' + note;
  const r = importMusicXML(
    score(bar(1, mid + '<backup><duration>2</duration></backup>' + sustained), bar(1, attrs + note + note)),
    options,
  );
  assert.equal(r.status, 'failed');
  assert.match(r.diagnostics.at(-1).message, /crosses a sustained voice/);
});

test('UTF-8 chunking preserves multibyte input and source ranges across tag boundaries', () => {
  const many = '<!--' + 'x'.repeat(16372) + '🎵-->';
  const source = many + score(bar(1, attrs + note + note), bar(1, attrs + note + note));
  const r = importMusicXML(new TextEncoder().encode(source), { sourceMap: true });
  assert.equal(r.status, 'exact');
  for (const map of r.documents[0].sourceMap) assert.equal(source.slice(...map.original), note);
});

test('an absent group symbol and mismatched group numbers never invent a bracket', () => {
  const part = bar(1, attrs + note + note);
  const grouped = score(part, part)
    .replace('<part-list>', '<part-list><part-group type="start" number="3"/>')
    .replace('</part-list>', '<part-group type="stop" number="3"/></part-list>');
  const result = importMusicXML(grouped, options);
  assert.equal(result.status, 'partial');
  assert.doesNotMatch(result.documents[0].text, /group bracket/);
  assert.ok(result.diagnostics.some((d) => d.message.includes('none staff group')));
  const mismatch = grouped.replace('type="stop" number="3"', 'type="stop" number="2"');
  assert.match(importMusicXML(mismatch, options).diagnostics.at(-1).message, /Unmatched staff group/);
});
