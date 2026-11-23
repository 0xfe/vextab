// Exercise measured input, normalization, bounded archives, and independent reference fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { importMusicXML } from 'vextab-import/musicxml';
import { importMXL } from 'vextab-import/mxl';
const fixture = (name) => readFileSync(new URL('../../issues/208/fixtures/' + name, import.meta.url));
const partial = { mode: 'partial' };
const model = readFileSync(new URL('voices.musicxml', import.meta.url), 'utf8');
const expected = readFileSync(new URL('voices.vextab', import.meta.url), 'utf8');

/** Protect musical observations individually so a regression identifies the changed construct. */
test('pinned cases resolve partial backups, divisions, ordered chord heads and pickup silence', () => {
  const backup = importMusicXML(fixture('backup.musicxml'), partial);
  assert.match(backup.documents[0].text, /voice lower \{ :q skip A3 A3 skip/);
  const divisions = importMusicXML(fixture('divisions.musicxml'), partial);
  assert.match(divisions.documents[0].text, /:q C5 C5 C5 C5 \|\s+:h C5 C5/);
  const chords = importMusicXML(fixture('21c-Chords-ThreeNotesDuration.musicxml'), {
    ...partial,
    sourceMap: true,
  });
  assert.match(chords.documents[0].text, /:q\. \(F4 A4 C5\) :8 \(A4 C5 G5\)/);
  assert.equal(chords.documents[0].sourceMap.length, 21);
  const pickup = importMusicXML(fixture('46e-PickupMeasure-SecondVoiceStartsLater.musicxml'), partial);
  assert.match(pickup.documents[0].text, /pickup 1\/4/);
  assert.match(pickup.documents[0].text, /lower \{ :q skip \|\s+:q skip C4 :h skip/);
});

test('partwise, timewise, stored MXL, deflated MXL and UTF-16 yield identical VexTab', async () => {
  const byTime = model
    .replaceAll('score-partwise', 'score-timewise')
    .replace('<part id="P1"><measure number="1">', '<measure number="1"><part id="P1">')
    .replace('</measure></part>', '</part></measure>');
  const utf16 = Buffer.from('\uFEFF' + model.replace('UTF-8', 'UTF-16'), 'utf16le');
  for (const source of [model, byTime, utf16]) assert.equal(importMusicXML(source).documents[0].text, expected);
  for (const name of ['stored.mxl', 'deflated.mxl']) {
    const result = await importMXL(fixture(name), { filename: 'voices.mxl' });
    assert.equal(result.documents[0].text, expected);
    assert.equal(result.documents[0].source.file, 'voices.mxl!/music/custom.xml');
  }
});

test('shorter chord head keeps its release in partial mode; longer chord heads fail', () => {
  const member =
    '<note><chord/><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>';
  const xml = model
    .replace('<divisions>1', '<divisions>2')
    .replaceAll('<duration>1', '<duration>2')
    .replace('</note>', '</note>' + member);
  assert.equal(importMusicXML(xml).status, 'failed');
  const result = importMusicXML(xml, partial);
  assert.match(result.documents[0].text, /:8 A4 skip :q skip|:8 A4 :q skip :8 skip/);
  assert.ok(result.diagnostics.some((d) => xml.slice(...d.range) === member));
  const longer = xml.replace(
    member,
    member.replace('duration>1', 'duration>4').replace('type>eighth', 'type>half'),
  );
  assert.equal(importMusicXML(longer, partial).status, 'failed');
});

test('Archive corruption, truncated data and ambiguous source clocks fail closed', async () => {
  const bad = Buffer.from(fixture('stored.mxl'));
  bad[bad.indexOf('<score-partwise') + 1] ^= 1;
  for (const bytes of [bad, bad.subarray(0, bad.length - 3)])
    assert.equal((await importMXL(bytes)).status, 'failed');
  const crossing = model.replace(
    '<backup><duration>1',
    '<attributes><divisions>2</divisions></attributes><backup><duration>2',
  );
  assert.match(importMusicXML(crossing).diagnostics.at(-1).message, /divisions change/);
  assert.equal(importMusicXML(model.replace('encoding="UTF-8"', 'encoding="UTF-16"')).status, 'exact');
  assert.equal(
    importMusicXML(Buffer.from(model.replace('encoding="UTF-8"', 'encoding="UTF-16"'))).status,
    'failed',
  );
});

test('tie endpoints, triplet elapsed time and absent opening repeat', () => {
  const note = (letter, units, type, extra = '') =>
    '<note><pitch><step>' +
    letter +
    '</step><octave>4</octave></pitch><duration>' +
    units +
    '</duration><voice>1</voice><type>' +
    type +
    '</type>' +
    extra +
    '</note>';
  const open = model.slice(0, model.indexOf('    <note>')).replace('divisions>1', 'divisions>3');
  const close = '</measure></part></score-partwise>';
  const tied = note('G', 3, 'quarter', '<tie type="start"/>') + note('G', 3, 'quarter', '<tie type="stop"/>');
  assert.match(importMusicXML(open + tied + close).documents[0].text, /G4 G4\[tie\]/);
  assert.equal(importMusicXML(open + tied.replace('type="stop"', 'type="start"') + close).status, 'failed');
  const ratio =
    '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
  const notes = note('C', 1, 'eighth', ratio).repeat(3) + note('D', 3, 'quarter');
  const repeat = '<barline location="right"><repeat direction="backward"/></barline>';
  const result = importMusicXML(open + notes + repeat + close);
  assert.match(result.documents[0].text, /repeatStart tuplet 3:2 \{ :8 C4 C4 C4 \} :q D4 bar repeatEnd/);
});

test('a keyboard source voice keeps its ownership when displayed on the lower staff', () => {
  const grouped = model
    .replace(
      '<part-name/>',
      '<part-name>Piano</part-name><score-instrument id="P1-I1"><instrument-name>Piano</instrument-name><instrument-sound>keyboard.piano</instrument-sound></score-instrument>',
    )
    .replace(
      '</attributes>',
      '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>',
    )
    .replace(
      '<type>quarter</type></note>\n    <backup>',
      '<type>quarter</type><staff>2</staff></note>\n    <backup>',
    )
    .replace('<voice>2</voice><type>quarter</type>', '<voice>2</voice><type>quarter</type><staff>2</staff>');
  const result = importMusicXML(grouped, partial);
  assert.deepEqual(
    result.documents[0].staves.map((s) => s.voices.map((v) => v.source)),
    [['1'], ['2']],
  );
  assert.match(result.documents[0].text, /Fn4\[onStaff lower\]/);
});
