// Compile the proposal's executable examples and exercise musical invariants and expansion limits.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

// CI passes the actual development or unpacked release bundle; standalone design checks use source.
const api = process.argv[2] ? createRequire(import.meta.url)(process.argv[2]) : await import('./compiler.mjs');
const compile = api.parseScore ? source => api.parseScore(source) : api.compile;

const events = (score, part = 0, staff = 0, voice = 0) => score.parts[part].staves[staff].voices[voice].events;
const errorCode = (source, code) => assert.throws(() => compile(source), error => error instanceof api.ScoreV2Error && error.code === code);

/** Exercise the score text a reader can copy directly from the proposal. */
const proposal = readFileSync(new URL('../../docs/grammarv2.md', import.meta.url), 'utf8');
const sources = [...proposal.matchAll(/^```vextab2\n(.*?)^```$/gms)].map(match => match[1]);

test('the examples printed in the proposal compile with the expected music', () => {
  const examples = sources.map(compile);
  assert.equal(examples.length, 6);
  const [frets, fingering, duet, keyboard, band, polymeter] = examples;
  assert.deepEqual(polymeter.parts.map(part => part.measureCount), [3, 2]);
  assert.deepEqual(events(frets).map(e => e.heads[0].fret), [0, 2, 3, 2]);
  assert.deepEqual(events(fingering).map(e => e.heads[0].marks.find(x => x.kind === 'finger').side), ['left', 'left', 'right']);
  assert.deepEqual(events(fingering)[1].heads[0].hammerFrom, {event:events(fingering)[0].id, head:0});
  assert.equal(events(fingering)[2].marks[0].kind, 'accent');
  assert.deepEqual(events(duet, 0, 0, 1).map(e => [e.at,e.duration]), [['0/1','1/2'], ['1/2','1/2']]);
  assert.deepEqual(events(duet).map(e => e.at), ['0/1', '1/4', '1/2', '3/4']);
  assert.equal(events(keyboard).length, 8);
  assert.deepEqual(events(keyboard, 0, 1).map(e => [e.bar,e.at]), [[1, '0/1'], [2, '0/1']]);
  assert.deepEqual(events(band)[0].heads.map(h => h.drum), ['kick', 'hat']);
  assert.deepEqual(events(band, 1).map(e => e.at), ['0/1', '1/12', '1/6', '1/4']);
  assert.equal(events(band, 1)[0].writtenDuration, '1/8');
});

/** Two occurrences point back to one authored head and two distinguishable expansion paths. */
test('UTF-16 ranges survive CRLF and non-BMP comments, patterns, and repetition', () => {
  const text = '// 🎸\r\npattern riff { (5/2[finger 2] 7/3)[accent] }\r\nguitar { times 4 { use riff } | }';
  const notes = events(compile(text));
  for (const [index,event] of notes.entries()) {
    assert.equal(text.slice(...event.heads[0].range), '5/2');
    assert.equal(text.slice(...event.heads[0].marks[0].range), 'finger 2');
    assert.equal(text.slice(...event.marks[0].range), 'accent');
    assert.equal(text.slice(...event.trace[1].range), 'use riff');
    assert.equal(event.trace[0].iteration, index + 1);
  }
  assert.equal(new Set(notes.map(e => e.id)).size, 4);
});

/** Each phrase invocation starts with quarters; every repetition inherits the same caller rhythm. */
test('duration changes stay within their voice, pattern, tuplet or iteration', () => {
  const score = compile('pattern quarter { C4 } staff { :8 times 2 { D4 :16 E4 F4 } use quarter G4 A4 | }');
  assert.deepEqual(events(score).map(e => e.duration), ['1/8','1/16','1/16','1/8','1/16','1/16','1/4','1/8','1/8']);
  const dots = events(compile('staff { :q.. C4 :16 D4 :h E4 | }'));
  assert.deepEqual(dots.map(e => e.duration), ['7/16','1/16','1/2']);
  const rests = events(compile('staff { :h rest skip | }'));
  assert.deepEqual(rests.map(e => [e.kind, e.at]), [['rest','0/1'],['skip','1/2']]);
});

/** Bar errors keep the written delimiter and the use site. Staff and voice clocks must agree. */
test('locates unfilled, overfilled and misaligned measures', () => {
  const text = 'pattern bad { C4 | }\nstaff { use bad }';
  assert.throws(() => compile(text), error => error.code === 'bar-length' &&
    text.slice(...error.range) === '|' && text.slice(...error.trace[0].range) === 'use bad');
  errorCode('staff { :w C4 D4 | }', 'bar-length');
  errorCode('staff { C4 }', 'bar-length');
  errorCode('piano { upper { :w C4 | D4 | } lower { :w C2 | } }', 'alignment');
});

/** Cycles, unsupported constructs and invalid attachment targets fail at their authored location. */
test('rejects bad syntax and domain values without executing score text', () => {
  for (const source of [
    'pattern recurse { use recurse } guitar { 0/1 | }',
    'pattern a { use b } pattern b { use a } staff { :w A4 | }',
    'staff { times forever { :w A4 | } }',
    'staff { while { A4 } }', 'staff { (C4 E4)[finger 3] }',
    'guitar { (3/1 5/1) }', 'drums { (hat hat) }', 'staff { C4[finger] }',
    'meter', 'guitar {', 'guitar { (', 'guitar { :16 C4[', 'pattern x { times',
    'staff { voice low { :w C4 | } voice low { :w C3 | } }',
  ]) errorCode(source, 'syntax');
  errorCode('staff { :w 5/3 | }', 'instrument');
  errorCode('drums { :w C4 | }', 'instrument');
  errorCode('guitar { :h 4/3 6/2[hammer] | }', 'hammer');
});

/** Structural caps apply across voices and to empty expansions, independent of wall-clock speed. */
test('bounds bytes, tokens, written depth, call depth, work, output and rational size', () => {
  errorCode(' '.repeat(65537), 'source-limit');
  errorCode('// ' + '🎹'.repeat(16384), 'source-limit');
  errorCode('guitar { ' + 'A4 '.repeat(8192) + '}', 'token-limit');
  errorCode('staff { ' + 'times 1 { '.repeat(25) + 'A4' + ' }'.repeat(26), 'depth-limit');
  let chain = 'pattern p0 { :w A4 | } ';
  for (let i = 1; i <= 25; i++) chain += 'pattern p' + i + ' { use p' + (i-1) + ' } ';
  errorCode(chain + 'staff { use p25 }', 'depth-limit');
  errorCode('staff { times 32 { times 32 { times 32 {} } } }', 'work-limit');
  errorCode('staff { times 32 { times 32 { :16 A4 B4 C4 D4 E4 F4 G4 A4 B4 C4 D4 E4 F4 G4 A4 B4 | } } }', 'event-limit');
  errorCode('staff { ' + 'tuplet 16:1 { '.repeat(9) + 'A4' + ' }'.repeat(10), 'fraction-limit');
});

/** Bar slices and spans survive serialization, including across written boundaries. */
test('indexes measures and cross-bar spans in the same ordered event stream', () => {
  const source = 'meter 1/4\r\npattern six { :8 tuplet 3:2 { C4 D4 E4 | F4 G4 A4 | } }\r\nstaff { times 2 { use six } }';
  const score = JSON.parse(JSON.stringify(compile(source)));
  assert.equal(score.source, source);
  assert.equal(score.language, 2);
  assert.equal(source.slice(...score.meterRange), '1/4');
  assert.equal(score.measureCount, 4);
  const voice = score.parts[0].staves[0].voices[0];
  assert.deepEqual(voice.measures.map(m => [m.number, m.start, m.end]), [[1,0,3],[2,3,6],[3,6,9],[4,9,12]]);
  for (const m of voice.measures) {
    assert.equal(source.slice(...m.barlineRange), '|');
    assert.ok(voice.events.slice(m.start, m.end).every(event => event.bar === m.number));
  }
  assert.deepEqual(voice.spans.map(span => [span.kind, span.ratio, span.first, span.last]), [
    ['tuplet', '3:2', voice.events[0].id, voice.events[5].id],
    ['tuplet', '3:2', voice.events[6].id, voice.events[11].id],
  ]);
  assert.equal(source.slice(...voice.events[9].rhythmRange), ':8');
  assert.deepEqual(voice.events[9].trace.map(frame => frame.iteration ?? frame.pattern ?? frame.tuplet), [2,'six','3:2']);
});

/** Each repeated hammer connects the two expanded events from its own performance of the phrase. */
test('retains authored spelling and exact head endpoints for repeated hammers', () => {
  const source = 'pattern lick { :8 (0/1 3/2) (5/2[hammer] 0/1) } guitar { times 4 { use lick } | }';
  const voice = compile(source).parts[0].staves[0].voices[0];
  assert.equal(voice.spans.length, 4);
  voice.spans.forEach((span, i) => {
    assert.equal(span.kind, 'hammer');
    assert.deepEqual(span.from, { event: voice.events[2*i].id, head: 1 });
    assert.deepEqual(span.to, { event: voice.events[2*i+1].id, head: 0 });
    assert.equal(source.slice(...span.range), 'hammer');
  });
  const spelling = events(compile('staff { C#4 Db4 Cn4 C4 | }')).map(e => e.heads[0].pitch);
  assert.deepEqual(spelling, ['C#4','Db4','Cn4','C4']);
});

/** Errors expose editor offsets in the unnormalized revision and the failed invocation. */
test('reports one-based diagnostic positions and the call site of the short measure', () => {
  const source = '// 🎵\r\npattern short { C4 | }\rguitar { use short }';
  assert.throws(() => compile(source), error => {
    assert.ok(error instanceof api.ScoreV2Error);
    assert.equal(error.code, 'bar-length');
    assert.deepEqual([error.line, error.column], [2,20]);
    assert.equal(source.slice(...error.range), '|');
    assert.equal(source.slice(...error.trace[0].range), 'use short');
    return true;
  });
});

test('incomplete edits produce a located diagnostic or a valid score at every prefix', () => {
  for (const source of sources) for (let end = 0; end <= source.length; end++) {
    try { compile(source.slice(0, end)); }
    catch (error) {
      assert.ok(error instanceof api.ScoreV2Error);
      const [start, stop] = error.range;
      assert.ok(0 <= start && start <= stop && stop <= end);
    }
  }
});

test('editable parity commands retain bounded, located failures at every cut', () => {
  const source = 'meter 2/4 meter 3+2/8 at 2 play { tempo 96 } layout { width 500 } staff { key D key F at 2 :h F4[courtesy] | :8 times 5 { C4 } bar final text words { :h "Hello" | start sign coda :8 "one" "two" "three" "four" "five" end sign segno | } }';
  assert.equal(compile(source).measureCount, 2);
  for (let n = 0; n < source.length; n++) {
    try { compile(source.slice(0,n)); }
    catch (error) {
      assert.ok(error instanceof api.ScoreV2Error, 'Located failure at offset ' + n);
      assert.ok(error.range[0] >= 0 && error.range[1] <= n);
    }
  }
  errorCode('meter 5/8 at 6 staff { :w C4 | }','alignment');
  errorCode('meter 1/4 staff { C4 | text words { end sign coda :q "hi" | } }','alignment');
});

test('aliases and hash comments retain the authored mark, pitches and colour literals', () => {
  const source = '# Aliases 🎸\r\nalias v="vibrato"\nalias su = "stroke up" sd="stroke down"\n' +
    '# Create a guitar stave\nguitar { 4/3 5/3 6/3[bend +1 rise=1, v] 10/1 | # second bar\n' +
    '5/3[sd] 4/3[su] x/3[sd] 2/2[v] | }';
  const notes = events(compile(source));
  assert.deepEqual(notes[2].heads[0].marks[0].rise, [1,1]);
  assert.deepEqual(notes.slice(4).map(e => e.marks[0].direction ?? e.marks[0].kind), ['down','up','down','vibrato']);
  assert.deepEqual(notes.slice(4).map(e => source.slice(...e.marks[0].range)), ['sd','su','sd','v']);
  const escaped = String.raw`alias words="label \"C#\" size wrong"` + '\nstaff { :w C4 | }';
  assert.throws(() => compile(escaped), e => escaped.slice(...e.range) === 'wrong');
  const coloured = events(compile('alias f="finger 2 right" staff { key F# :w (C##4[f] F#4)[ink #abc, label "#solo //"] | }'));
  assert.equal(coloured[0].heads[0].marks[0].side, 'right');
  assert.equal(coloured[0].marks[0].value, '#abc');
  assert.equal(coloured[0].marks[1].text, '#solo //');
  for (const invalid of ['alias v="v"', 'alias v="stroke"', 'alias v="stroke up extra"', 'alias v="ink"',
    'alias v="vibrato" v="tie"', 'alias stroke="vibrato"', 'alias v="times 32 {}"']) {
    errorCode(invalid + ' guitar { :w 0/1 | }', 'syntax');
  }
});

test('same-string runs emit separate attacks and keep per-fret editor selections', () => {
  const source = 'guitar { :8 4-15-x-6/3[vibrato] :h 0/1 | }';
  const notes = events(compile(source));
  assert.deepEqual(notes.map(e => e.heads[0].fret), [4,15,'x',6,0]);
  assert.deepEqual(notes.map(e => source.slice(...e.heads[0].range)), ['4','15','x','6/3','0/1']);
  assert.deepEqual(notes.map(e => e.marks.length), [0,0,0,1,0]);
  assert.deepEqual(events(compile('guitar { 4-5-6/3 }')).map(e => e.at), ['0/1','1/4','1/2']);
  errorCode('guitar { 4-5-6/3 | }', 'bar-length');
  errorCode('guitar { meter 4/4 4-5-6/3 }', 'bar-length');
  errorCode('guitar { 4--6/3 }', 'syntax');
  errorCode('guitar { (4-5/3 0/1) }', 'syntax');
});

test('each part owns its bar count, changes and meter source', () => {
  const source = 'meter 4/4 meter cut at 2 staff { meter 3/4 :h. C4 | meter 3+2/8 :8 E4 F4 G4 A4 B4 | } '
    + 'guitar { meter 2/4 times 3 { :h 0/6 | } } staff { :w C3 | D3 | }';
  const score = compile(source);
  assert.deepEqual(score.parts.map(p => p.measureCount), [2, 3, 2]);
  assert.equal(score.measureCount, 3);
  const bars = score.parts.map(p => p.staves[0].voices[0].measures);
  assert.deepEqual(bars.map(group => group.map(b => [b.meter, b.span])), [
    [['3/4','3/4'],['5/8','5/8']], [['2/4','1/2'],['2/4','1/2'],['2/4','1/2']], [['4/4','1/1'],['2/2','1/1']]]);
  assert.deepEqual(bars.map(group => group.map(b => source.slice(...b.meterRange))), [['3/4','3+2/8'],['2/4','2/4','2/4'],['4/4','cut']]);
  assert.equal(bars[0][1].meterSign, '3+2/8');
  assert.equal(bars[2][1].meterSign, 'C|');
});

test('meter changes belong to a bar boundary, even inside a pattern or a later voice', () => {
  const source = 'pattern turn { meter 3/4 :h. G3 | } meter 2/4 staff { voice melody { :h E4 | :h. F4 | } '
    + 'voice bass { :h C3 | use turn } text counts { :h "one" | :h. "two" | } }';
  const part = compile(source).parts[0];
  for (const voice of [...part.staves[0].voices, part.text[0].voice])
    assert.deepEqual(voice.measures.map(b => [b.meter, b.span]), [['2/4','1/2'], ['3/4','3/4']]);
  for (const [bad, text] of [
    ['staff { C4 meter 3/4 D4 E4 | }', 'meter 3/4'],
    ['meter 2/4 staff { meter 5/8 at 4 :h C4 | }', '5/8'],
    ['staff { voice a { meter 2/4 :h C4 | } voice b { meter 1/2 :h C3 | } }', '1/2'],
    ['pickup 1/4 staff { meter 1/4 D4 | }', '1/4'],
  ]) assert.throws(() => compile(bad), e => bad.slice(...e.range) === text);
  assert.equal(compile('pickup 1/1 staff { meter 6/4 :w C4 | }').pickup, '1/1');
});
