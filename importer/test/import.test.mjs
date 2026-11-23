// Public regression cases for timing, pitch, located losses and the bounded target profile.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { importMusicXML } from 'vextab-import/musicxml';
import { importLilyPond } from 'vextab-import/lilypond';

const fixture = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const xml = fixture('voices.musicxml'), ly = fixture('voices.ly'), expected = fixture('voices.vextab');

test('independent sources emit identical, editable text and distinct source maps', () => {
  for (const [read, source, mapped] of [[importMusicXML, xml, 3], [importLilyPond, ly, 4]]) {
    const result = read(source, { sourceMap: true });
    assert.equal(result.status, 'exact');
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.documents[0].text, expected);
    const ids = mapped === 3 ? ['1', '2'] : ['upper', 'lower'];
    assert.deepEqual(result.documents[0].source.voices, ids.map((source, i) => ({ source, target: ['upper', 'lower'][i] })));
    const map = result.documents[0].sourceMap;
    assert.equal(map.length, mapped);
    assert.deepEqual(map.map(m => expected.slice(...m.generated)), mapped === 3 ? ['F#4', 'Fn4', 'C4'] : ['F#4', 'Fn4', 'skip', 'C4']);
    const origins = map.map(m => source.slice(...m.original));
    if (mapped === 3) assert.deepEqual(origins, source.match(/<note>.*?<\/note>/g));
    else assert.deepEqual(origins, ["fis'4", "f'", 's4', "c'"]);
    assert.equal(read(source).documents[0].sourceMap, undefined);
  }
  assert.equal(importMusicXML(new TextEncoder().encode(xml)).documents[0].text, expected);
});

test('strict errors and opt-in known losses refer to the original decoded text', () => {
  const comment = '<!-- 🎵 -->\r\n';
  const mark = '<staccato/>';
  const annotated = xml.replace('<part-list>', comment + '<part-list>').replace('</note>', '<notations><articulations>' + mark + '</articulations></notations></note>');
  for (const [read, source, spelling] of [[importMusicXML, annotated, mark], [importLilyPond, '% 🎵\r\n' + ly.replace("fis'4", "fis'4-."), '-.']]) {
    const strict = read(source, { filename: 'fixture' });
    assert.equal(strict.status, 'failed');
    assert.deepEqual(strict.documents, []);
    const partial = read(source, { filename: 'fixture', mode: 'partial' });
    assert.equal(partial.status, 'partial');
    assert.equal(partial.documents[0].text, expected);
    const [d] = partial.diagnostics;
    assert.equal(d.code, 'omitted-mark');
    assert.equal(d.severity, 'warning');
    assert.ok(d.part && d.measure && d.voice);
    assert.equal(d.file, 'fixture');
    assert.equal(source.slice(...d.range), spelling);
  }
});

test('unsupported music and unresolved time fail in either mode', () => {
  const cases = [
    [importMusicXML, xml.replace('<backup><duration>1', '<backup><duration>3')],
    [importMusicXML, xml.replace('<backup><duration>1', '<backup><duration>2').replace('<voice>2', '<voice>1')],
    [importMusicXML, xml.replace('<pitch>', '<grace/><pitch>')],
    [importMusicXML, xml.replace('<note>', '<note print-object="no">')],
    [importMusicXML, xml.replace('</part>', '<measure number="2"/></part>')],
    [importMusicXML, xml.replace('<type>quarter', '<type>half')],
    [importMusicXML, xml.replace('<divisions>1', '<divisions>3')],
    [importMusicXML, xml.replace('</note>', '</wrong>')],
    [importMusicXML, Uint8Array.of(255)],
    [importLilyPond, ly.replace("f' }", "\\unknown f' }")],
    [importLilyPond, ly + '\n%{ unfinished'],
  ];
  for (const [read, source] of cases) for (const mode of ['strict', 'partial']) {
    const result = read(source, { mode });
    assert.equal(result.status, 'failed', String(source));
    assert.equal(result.documents.length, 0);
    assert.equal(result.diagnostics.at(-1).severity, 'error');
  }
});

test('relative and inherited durations can extend one simultaneous branch across bars', () => {
  const extended = importLilyPond(ly.replace("fis'4", "fis'2"));
  assert.equal(extended.status, 'exact');
  assert.equal(extended.documents[0].staves[0].measures.length, 2);
  assert.equal(importLilyPond(ly.replace('s4', 's')).documents[0].text, expected);
  assert.equal(importLilyPond("\\relative { c'1 }").status, 'exact');
});

test('source duration, rest visibility, key and register are resolved from input', () => {
  const text = importLilyPond("{ \\key bes \\major \\time 3/4 bes'8 b' r4 es' }").documents[0].text;
  assert.match(text, /key Bb/);
  assert.match(text, /:8 Bb4 Bn4 :q rest Eb4/);
  const transcribed = importMusicXML(xml.replaceAll('<duration>1', '<duration>7').replace('<divisions>1', '<divisions>7'));
  assert.equal(transcribed.documents[0].text, expected);
  const named = importMusicXML(xml.replace('<part-name/>', '<part-name>A &amp; "B"</part-name>'));
  assert.ok(named.documents[0].text.includes('name "A & \\"B\\""'));
  assert.match(importLilyPond("{ \\time 3/4 << { c'2 d'4 } \\\\ { e'4 } >> }").documents[0].text, /:q E4 :h skip/);
});

test('an unspellable cursor position is reported at the affected voice', () => {
  const offGrid = xml.replace('<divisions>1', '<divisions>6').replaceAll('<duration>1', '<duration>6')
    .replace('<backup><duration>6', '<backup><duration>4')
    .replace('<duration>6</duration><voice>2</voice><type>quarter', '<duration>3</duration><voice>2</voice><type>eighth');
  const result = importMusicXML(offGrid);
  assert.equal(result.status, 'failed');
  assert.equal(result.diagnostics[0].voice, '2');
  assert.match(result.diagnostics[0].message, /gap/);
  assert.ok(offGrid.slice(...result.diagnostics[0].range).startsWith('<note>'));
});

test('limits and unknown input after a known loss never return a truncated score', () => {
  for (const [read, source] of [[importMusicXML, ' '.repeat(1048577)], [importLilyPond, '{ ' + 's256 '.repeat(4352) + '}']]) {
    const result = read(source);
    assert.equal(result.status, 'failed');
    assert.equal(result.diagnostics[0].code, 'limit');
  }
  const result = importLilyPond("{ c'4-. \\unknown }", { mode: 'partial' });
  assert.deepEqual(result.diagnostics.map(d => d.severity), ['warning', 'error']);
  assert.deepEqual(result.documents, []);
});
