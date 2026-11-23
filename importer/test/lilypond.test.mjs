// Public LilyPond regressions for source resolution, movement selection and bounded failure.
import assert from 'node:assert/strict';
import test from 'node:test';
import { importLilyPond as read } from 'vextab-import/lilypond';

const ly = String.raw;
function exact(source, options) {
  const result = read(source, options);
  assert.equal(result.status, 'exact', JSON.stringify(result.diagnostics));
  return result.documents[0];
}

test('virtual includes preserve definition and use locations through nested variables', () => {
  const source = ly`\include "lib/theme.ly"
\score { \theme \layout {} }`;
  const theme = ly`\include "bass.ly"
theme = { \bass \bass }`;
  const bass = "bass = { c'2 }";
  const options = { includes: { 'lib/theme.ly': theme, 'lib/bass.ly': bass }, filename: 'song.ly', sourceMap: true };
  const doc = exact(source, options);
  assert.equal(doc.text, exact("{ c'2 c'2 }").text);
  const nested = exact(source, { filename: 'scores/song.ly', includes: {
    'scores/lib/theme.ly': theme, 'scores/lib/bass.ly': bass } });
  assert.equal(nested.text, doc.text);
  const map = doc.sourceMap;
  assert.equal(map.length, 2);
  for (const m of map) {
    assert.equal(m.file, 'lib/bass.ly');
    assert.equal(bass.slice(...m.original), "c'2");
    assert.deepEqual(m.uses.map(x => x.file), ['song.ly', 'lib/theme.ly']);
    assert.equal(source.slice(...m.uses[0].range), '\\theme');
    assert.equal(theme.slice(...m.uses[1].range), '\\bass');
  }
  assert.notDeepEqual(map[0].uses[1].range, map[1].uses[1].range);
});

test('binding and language lookup follow source order', () => {
  const source = ly`\language "english"
cell = { cs'4 }
earlier = { \cell }
\language "deutsch"
cell = { b'4 h'4 }
\score { { \earlier \cell r4 } }`;
  assert.match(exact(source).text, /C#4 Bb4 B4 rest/);
  assert.match(exact("{ \\key d \\minor b'1 }").text, /key Dm[\s\S]*Bn4/);
});

test('selection isolates unknown timing in a second movement and locates included failures', () => {
  const source = ly`\include "m.ly" \book { \bookpart { \score { \fixed c' { c1 } \layout {} } }
    \score { \bad \midi {} } }`;
  const included = ly`bad = { c'2 \arbitrary c'2 }`;
  assert.match(exact(source, { includes: { 'm.ly': included } }).text, /:w C4/);
  for (const score of ['midi', 1]) for (const mode of ['strict', 'partial']) {
    const r = read(source, { mode, score, includes: { 'm.ly': included } });
    assert.equal(r.status, 'failed');
    const d = r.diagnostics.at(-1);
    assert.equal(d.file, 'm.ly');
    assert.equal(included.slice(...d.range), '\\arbitrary');
  }
  const separate = ly`\score { { c'1 } \layout {} } \score { { d'1 } \midi {} }`;
  assert.match(exact(separate, {score: 1}).text, /D4/);
  assert.equal(read(separate, {score: 2}).status, 'failed');
});

test('octaves, dotted inheritance, grace and repeated durations remain editable', () => {
  assert.equal(exact(ly`\relative { c'4. b8 a2 }`).text,
    exact(ly`\fixed c' { c4. b,8 a,2 }`).text);
  assert.match(exact(ly`{ \grace { d'8 e' } c'1 }`).text, /C4\[grace before \(D4 E4\)\]/);
  assert.match(exact(ly`{ \time 3/4 <c' e'>4 q4 4 }`).text, /(\(C4 E4\) ){3}/);
  assert.match(exact(ly`{ \repeat unfold 2 { c'2 } }`).text, /:h C4 C4/);
});

test('unfold transforms finite volta music after resolving written relative pitches', () => {
  const source = ly`\unfoldRepeats \relative c' { \time 2/4 \repeat volta 2 { c2 }
    \alternative { { d2 } { e2 } } }`;
  assert.equal(exact(source).text, exact(ly`{ \time 2/4 c'2 | d'2 | c'2 | e'2 | }`).text);
});

test('malformed, cyclic, explosive and unresolved sources fail with a diagnostic', () => {
  for (const [source, opts] of [
    [ly`\include "a.ly"`, {includes: {'a.ly': ly`\include "b.ly"`, 'b.ly': ly`\include "a.ly"`}}],
    [ly`\include "../a.ly"`, {includes: {}}],
    [ly`{ \applyMusic #unknown { c'1 } }`, {}],
    [ly`{ \repeat unfold 32 { \repeat unfold 32 { \repeat unfold 32 { c'1 } } }`, {}],
    [ly`{ c'4 ~ d'4 e'2 }`, {}],
    [ly`{ c'4 | d'2. }`, {}],
    [ly`\version "2.23.99" { c'1 }`, {}],
  ]) {
    const r = read(source, { ...opts, mode: 'partial' });
    assert.equal(r.status, 'failed', source);
    assert.deepEqual(r.documents, []);
    assert.equal(r.diagnostics.at(-1).severity, 'error');
  }
});
