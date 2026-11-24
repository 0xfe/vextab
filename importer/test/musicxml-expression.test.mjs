// Exercise expressive MusicXML through public entry points and keep older output profiles stable.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { importMusicXML } from 'vextab-import/musicxml';

const expressive = { targetProfile: 'expressive' };
const example = (name) =>
  readFileSync(new URL('../../issues/211/fixtures/' + name + '.musicxml', import.meta.url), 'utf8');
const score = (music) =>
  '<score-partwise version="4.0"><part-list><score-part id="P"><part-name>Solo</part-name></score-part></part-list><part id="P"><measure number="1"><attributes><divisions>2</divisions></attributes>' +
  music +
  '</measure></part></score-partwise>';
const note = (letter, other = '', prefix = '') =>
  '<note>' +
  prefix +
  '<pitch><step>' +
  letter +
  '</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type>' +
  other +
  '</note>';
const mark = (children) => '<notations>' + children + '</notations>';
const technical = (children) => mark('<technical>' + children + '</technical>');
const direction = (type) => '<direction><direction-type>' + type + '</direction-type></direction>';
const grace = (pitch, time) =>
  '<note><grace ' + time + '/><pitch><step>' + pitch + '</step><octave>4</octave></pitch></note>';
function exact(source) {
  const result = importMusicXML(source, expressive);
  assert.equal(result.status, 'exact', JSON.stringify(result.diagnostics));
  assert.equal(result.target.minimumVersion, '6.4.0');
  return result.documents[0].text;
}

test('grace steals exact time from the selected principal and preserves its side and slash', () => {
  const text = exact(
    score(
      grace('D', 'slash="yes" steal-time-following="20"') +
        note('E') +
        note('G') +
        grace('F', 'steal-time-previous="12.5"'),
    ),
  );
  assert.match(text, /E4\[grace before slashed steal=1\/5 \(D4\)\]/);
  assert.match(text, /G4\[grace after steal=1\/8 \(F4\)\]/);
  for (const attrs of ['make-time="1"', 'steal-time-previous="10" steal-time-following="20"']) {
    const source = score(grace('D', attrs) + note('E'));
    const result = importMusicXML(source, expressive);
    assert.equal(result.status, 'failed');
    assert.match(source.slice(...result.diagnostics.at(-1).range), /^<grace/);
  }
});
test('short and tied chord heads retain their own duration and pitch after chord reordering', () => {
  const stop = mark('<tied type="stop"/>'),
    start = mark('<tied type="start"/>');
  const short = note('E', '', '<chord/>')
    .replace('duration>2', 'duration>1')
    .replace('type>quarter', 'type>eighth');
  const source = score(note('C', start) + short + note('G') + note('C', stop, '<chord/>'));
  assert.match(exact(source), /\(C4\[tieStart (\w+)\] E4\[sustain 1\/8\]\) \(G4 C4\[tieEnd \1\]\)/);
  assert.equal(importMusicXML(source, { targetProfile: 'extended' }).status, 'failed');
});
test('guitar gestures retain strings, frets, capo, fingering, bend and written note', () => {
  const base = example('guitar');
  const notes =
    note('G', technical('<string>1</string><fret>1</fret><hammer-on type="start"/>')) +
    note(
      'A',
      technical(
        '<string>1</string><fret>3</fret><hammer-on type="stop"/><pull-off type="start"/><fingering placement="above">2</fingering>',
      ),
    ) +
    note(
      'G',
      technical('<string>1</string><fret>1</fret><pull-off type="stop"/>').replace(
        '</notations>',
        '<slide type="start"/></notations>',
      ),
    ) +
    note(
      'B',
      technical('<string>1</string><fret>5</fret><bend><bend-alter>1.5</bend-alter></bend>').replace(
        '</notations>',
        '<slide type="stop"/></notations>',
      ),
    );
  const xml = base.replace('<divisions>1', '<divisions>2').replace(/<note>[\s\S]*<\/note>/, notes);
  const text = exact(xml);
  for (const token of [
    'capo 2',
    '3/1[write A4, finger 2 above, hammer]',
    '1/1[write G4, pull]',
    '5/1[write B4, slide, bend +1.5 rise=1/2]',
  ])
    assert.ok(text.includes(token), text);
});
test('staff-positioned pedal stops at an onset and supports a release at the bar end', () => {
  const keyboard = example('keyboard');
  const start = direction('<pedal type="start"/>'),
    stop = direction('<pedal type="stop"/>');
  const begin = keyboard.replace('<note>', start + '<note>');
  const second = begin.replace('<note><pitch><step>D', stop + '<note><pitch><step>D');
  assert.match(exact(second), /D5\[pedal up onset\]/);
  const ending = begin.replace(
    '<backup>',
    stop.replace('</direction>', '<staff>2</staff></direction>') + '<backup>',
  );
  assert.match(exact(ending), /G3\[[^\]]*pedal up[^\]]*\]/);
});
test('string annotations, fingering, mordent and articulation survive on ordinary pitched staves', () => {
  const notation = mark(
    '<technical><string placement="above">3</string><fingering>2</fingering></technical><articulations><staccato placement="below"/></articulations><ornaments><mordent/></ornaments>',
  );
  const text = exact(score(note('C', notation)));
  for (const token of ['stringNumber 3 above', 'finger 2 left', 'staccato below', 'ornament mordent_inverted'])
    assert.ok(text.includes(token), text);
});
test('a direction at a fractional offset attaches to the specified voice after a backup', () => {
  const d =
    '<direction><direction-type><dynamics><ff/></dynamics></direction-type><offset>2</offset><voice>2</voice></direction>';
  const v2 = (n) => note(n).replace('<type>', '<voice>2</voice><type>');
  const source = score(d + note('C') + note('D') + '<backup><duration>4</duration></backup>' + v2('E') + v2('F'));
  assert.match(exact(source), /voice lower \{ :q E4 F4\[dynamic ff\]/);
});
test('literal direction words keep quotes and warn about unrepresented color and a second label', () => {
  const words = direction('<words color="#880000">Say "hello"</words><words>Again</words>');
  const result = importMusicXML(score(words + note('C')), { ...expressive, mode: 'partial' });
  assert.equal(result.status, 'partial');
  assert.ok(result.documents[0].text.includes(JSON.stringify('Say "hello"')));
  assert.equal(
    result.diagnostics.filter((d) => /words attribute color|Multiple direction texts/.test(d.message)).length,
    2,
  );
});
test('streaming partwise and timewise selection retain the same inherited state and reject repeat crossings', () => {
  const bars = [
    '<attributes><divisions>2</divisions><key><fifths>1</fifths></key></attributes><sound tempo="92"/>' +
      note('D'),
    note('F', mark('<articulations><staccato/></articulations>')),
  ];
  const list = '<part-list><score-part id="P"><part-name>Solo</part-name></score-part></part-list>';
  function xml(timewise, bars) {
    const root = timewise ? 'score-timewise' : 'score-partwise';
    const music = bars
      .map(
        (bar, i) =>
          '<measure number="' +
          (i + 1) +
          '">' +
          (timewise ? '<part id="P">' + bar + '</part>' : bar) +
          '</measure>',
      )
      .join('');
    return (
      '<' +
      root +
      ' version="4.0">' +
      list +
      (timewise ? music : '<part id="P">' + music + '</part>') +
      '</' +
      root +
      '>'
    );
  }
  const options = { ...expressive, selection: { firstMeasure: 2, lastMeasure: 2 } };
  const reference = importMusicXML(xml(true, bars), options);
  assert.equal(reference.status, 'exact');
  assert.match(reference.documents[0].text, /tempo 92 at 1/);
  assert.match(reference.documents[0].text, /key G/);
  const streamed = importMusicXML(xml(false, bars), options);
  assert.deepEqual(streamed, reference);
  const start = '<barline location="left"><repeat direction="forward"/></barline>';
  for (const timewise of [false, true]) {
    const result = importMusicXML(xml(timewise, [start + bars[0], bars[1]]), options);
    assert.match(result.diagnostics.at(-1).message, /selection begins inside a repeat/);
    assert.equal(result.documents.length, 0);
  }
});

test('numerical dynamics belong to individual heads and one direction controls the written chord', () => {
  const authored = (letter, percentage, extra = '', prefix = '') =>
    note(letter, extra, prefix).replace('<note>', '<note dynamics="' + percentage + '">');
  const source = score(authored('C', '0') + authored('E', '132.22', '<stem>down</stem>', '<chord/>') +
    authored('F', '100') + authored('G', '54.44'));
  const result = importMusicXML(source, expressive);
  assert.equal(result.status, 'exact', JSON.stringify(result.diagnostics));
  assert.equal(result.target.minimumVersion, '6.6.0');
  assert.match(result.documents[0].text, /\(C4\[velocity 0\] E4\[velocity 119\]\)\[stem down\] F4\[velocity 90\] G4\[velocity 49\]/);
  assert.equal(importMusicXML(source, {targetProfile: 'extended'}).status, 'failed');
  const clipped = importMusicXML(score(authored('C', '200')), {...expressive, mode: 'partial'});
  assert.equal(clipped.status, 'partial');
  assert.match(clipped.documents[0].text, /velocity 127/);
  assert.ok(clipped.diagnostics.some(d => d.message.includes('Clipped note velocity')));
  for (const value of ['-1', '1e2', 'NaN', '']) {
    const malformed = score(authored('C', value));
    const error = importMusicXML(malformed, expressive).diagnostics.at(-1);
    assert.equal(error.code, 'syntax');
    assert.match(malformed.slice(...error.range), /^<note/);
  }
  const opposing = score(note('C', '<stem>down</stem>') + note('E', '<stem>up</stem>', '<chord/>'));
  assert.match(importMusicXML(opposing, expressive).diagnostics.at(-1).message, /Conflicting stem directions/);
});

test('overlong bars require independent part cursors to agree under the written meter', () => {
  const long = score(note('C').repeat(5));
  const two = other => long.replace('</part-list>', '<score-part id="B"><part-name>Oboe</part-name></score-part></part-list>')
    .replace('</score-partwise>', '<part id="B"><measure number="1"><attributes><divisions>2</divisions></attributes>' + other + '</measure></part></score-partwise>');
  const result = importMusicXML(two(note('D').repeat(5)), expressive);
  assert.equal(result.status, 'exact', JSON.stringify(result.diagnostics));
  assert.equal((result.documents[0].text.match(/fragment \{/g) ?? []).length, 2);
  const selected = {...expressive, selection: {parts: ['B']}};
  assert.equal(importMusicXML(two(note('D').repeat(5)), selected).status, 'exact');
  assert.equal(importMusicXML(two(note('D').repeat(4)), {...expressive, selection: {parts: ['P']}}).status, 'failed');
  for (const source of [long, two(note('D').repeat(4))]) {
    const error = importMusicXML(source, expressive).diagnostics.at(-1);
    assert.equal(error.code, 'timing');
    assert.equal(error.measure, '1');
    assert.match(source.slice(...error.range), /^<measure/);
  }
});
