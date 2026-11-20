// Verify version selection and source-mapped results through the public browser API.
import { parseScore, ScoreError, ScoreV2Error } from '../src/browser';

QUnit.module('Grammar selection', () => {
  QUnit.test('ordinary calls read v2 and explicit v1 calls retain their historical model', assert => {
    const old = 'stave time=1/4\nnotes C/4';
    assert.equal(parseScore(old, { language: 1 }).measures.length, 1);
    const source = 'meter 1/4\npiano { upper { C4 | } lower { C3 | } } drums { kick | }';
    const score = parseScore(source);
    assert.deepEqual(score, parseScore(source, { language: 2 }));
    assert.deepEqual(score.parts.map(p => p.staves.map(s => s.name)), [['upper','lower'],['main']]);
    assert.ok(score.parts.every(part => part.staves.every(staff => staff.voices[0].measures.length === score.measureCount)));
    assert.throws(() => parseScore(source, { language: 1 }), ScoreError);
    assert.throws(() => parseScore(old), ScoreV2Error);
  });

  QUnit.test('the browser can select the same definition for two distinct expanded attacks', assert => {
    const source = '// 🎸\r\npattern riff { :h 5/3 }\r\nguitar { times 2 { use riff } | }';
    const events = parseScore(source, { language: 2 }).parts[0].staves[0].voices[0].events;
    assert.notEqual(events[0].id, events[1].id);
    const input = document.createElement('textarea');
    // DOM textareas normalize CRLF. Check offsets against the original revision first.
    for (const event of events) assert.equal(source.slice(...event.range), '5/3');
    input.value = source;
    const normalized = parseScore(input.value, { language: 2 }).parts[0].staves[0].voices[0].events;
    input.setSelectionRange(...normalized[1].range);
    assert.equal(input.value.slice(input.selectionStart, input.selectionEnd), '5/3');
  });
});
