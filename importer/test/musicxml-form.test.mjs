// Verify shared musical form through both public MusicXML representations and score selections.
import assert from 'node:assert/strict';
import test from 'node:test';
import { importMusicXML } from 'vextab-import/musicxml';

const expressive = { targetProfile: 'expressive', mode: 'partial' };
const ending = (n, type, back = false) =>
  '<barline location="' +
  (type === 'start' ? 'left' : 'right') +
  '"><ending number="' +
  n +
  '" type="' +
  type +
  '"/>' +
  (back ? '<repeat direction="backward"/>' : '') +
  '</barline>';
const whole =
  '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>';
function source(timewise) {
  const parts = ['P1', 'P2'];
  const partsList =
    '<part-list>' +
    parts.map((id) => '<score-part id="' + id + '"><part-name>' + id + '</part-name></score-part>').join('') +
    '</part-list>';
  function content(id, i) {
    const control = id === parts[0];
    return (
      (i === 0 ? '<attributes><divisions>1</divisions></attributes>' : '') +
      (control && i > 0 ? ending(i, 'start') : '') +
      whole +
      (i > 0 && control
        ? ending(i, 'stop', i < 3)
        : i > 0 && i < 3
          ? '<barline location="right"><repeat direction="backward"/></barline>'
          : '')
    );
  }
  const bar = (i, s) => '<measure number="' + (i + 1) + '">' + s + '</measure>';
  const part = (p, s) => '<part id="' + p + '">' + s + '</part>';
  const ordinals = [0, 1, 2, 3];
  const body = timewise
    ? ordinals.map((i) => bar(i, parts.map((p) => part(p, content(p, i))).join(''))).join('')
    : parts.map((p) => part(p, ordinals.map((i) => bar(i, content(p, i))).join(''))).join('');
  const tag = 'score-' + (timewise ? 'timewise' : 'partwise');
  return '<' + tag + ' version="3.0">' + partsList + body + '</' + tag + '>';
}

test('a selected lower part inherits three consecutive endings printed only on the first part', () => {
  for (const timewise of [false, true]) {
    const result = importMusicXML(source(timewise), { ...expressive, selection: { parts: ['P2'] } });
    assert.equal(result.status, 'exact', JSON.stringify(result.diagnostics));
    assert.match(
      result.documents[0].text,
      /volta 3 \{ :w C4 \| \}\s+ending 1 \{ :w C4 \| \}\s+ending 2 \{ :w C4 \| \}\s+ending 3 \{ :w C4 \| \}/,
    );
    const crossing = importMusicXML(source(timewise), {
      ...expressive,
      selection: { parts: ['P2'], firstMeasure: 3 },
    });
    assert.equal(crossing.status, 'failed');
  }
});

test('selected lower part fails at a playback jump present only on its conductor staff', () => {
  for (const timewise of [false, true]) {
    const xml = source(timewise).replace(whole, whole + '<direction><sound fine="yes"/></direction>');
    const result = importMusicXML(xml, { ...expressive, selection: { parts: ['P2'] } });
    assert.equal(result.status, 'failed');
    assert.equal(result.diagnostics.at(-1).part, 'P1');
    assert.equal(xml.slice(...result.diagnostics.at(-1).range), '<sound fine="yes"/>');
  }
});

test('a counted repeat requires a supported bounded count and declares the host version', () => {
  const xml =
    '<score-partwise version="4.0"><part-list><score-part id="P"><part-name>Test</part-name></score-part></part-list><part id="P"><measure number="1"><attributes><divisions>1</divisions></attributes>' +
    whole +
    '<barline><repeat direction="backward" times="5"/></barline></measure></part></score-partwise>';
  const accepted = importMusicXML(xml, expressive);
  assert.equal(accepted.status, 'exact');
  assert.equal(accepted.target.minimumVersion, '6.5.0');
  assert.match(accepted.documents[0].text, /repeatCount 5 \{ :w C4 \| \}/);
  for (const invalid of ['0', '1', '33', '100', '2.5']) {
    const result = importMusicXML(xml.replace('times="5"', 'times="' + invalid + '"'), expressive);
    assert.equal(result.status, 'failed');
    assert.match(result.diagnostics.at(-1).message, /between two and 32/);
  }
});
