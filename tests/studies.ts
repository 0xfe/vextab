// Exercise the exact guide scores through parsing, reflow, navigation and independent publication.
import { Annotation, Bend, StaveNote, TabNote, measureEngraving } from 'vexflow';
import guitar from '../guide/scores/drop-d-turnaround.vextab';
import lead from '../guide/scores/slow-river.vextab';
import { renderScore, renderScorePart } from '../src/score/layout';
import { projectScoreV2 } from '../src/score/grammar2/project';
import { parseScore } from '../src/score/parse';

function read(source: string) { return projectScoreV2(parseScore(source)); }

function host() {
  const target = document.createElement('div');
  document.querySelector('#qunit-fixture').append(target);
  return target;
}

/** Ignore per-view DOM IDs. Compare actual note positions, times and row assignments on the return trip. */
function geometry(view: ReturnType<typeof renderScore>) {
  return {
    rows: view.composition.sheet.getContinuousLayout().rows.map(r => r.measures),
    events: view.navigation.events.map(e => [e.source, e.staff, e.onset, e.duration, view.composition.getNote(e.id).getAbsoluteX()]),
  };
}

QUnit.module('Responsive studies', () => {
  QUnit.test('The 12-bar turnaround keeps bend, mute, ties, endings and barlines through reflow', assert => {
    const parsed = read(guitar);
    const target = host();
    const initial = geometry(renderScore(target, parsed, { width: 960 }));
    assert.equal(parsed.measures.length, 12);
    const voice = parsed.measures[3].voices[0];
    const attack = voice.events[0];
    assert.deepEqual(attack.heads.map(h => [h.position.str, h.sounding]), [[2,'e/4'],[3,'d/4']]);
    assert.deepEqual(attack.bend.spec, { string: 3, semitones: 2, rise: [1,2], hold: [3,4], release: [1,1] });
    assert.equal(attack.duration, '1/2');
    assert.equal(parsed.measures[0].voices[1].events[0].duration, '1/1');
    const dead = parsed.measures[4].voices[0].events[1];
    assert.equal(dead.heads[0].sounding, null);
    assert.equal(dead.heads[0].position.fret, 'X');
    for (const part of ['score', 'tab'] as const) {
      // At phone width the held chord crosses a system break with both the 9 pt and 11 pt fret defaults.
      const view = renderScore(target, parsed, { width: 320, part });
      assert.deepEqual(view.diagnostics, []);
      const layout = view.composition.sheet.getContinuousLayout();
      assert.ok(layout.rows.length > initial.rows.length);
      const event = view.navigation.events.find(e => e.source === attack.id && e.staff === 'tab');
      const note = view.composition.getNote(event.id) as TabNote;
      assert.deepEqual(note.getPositions().map(p => p.str), [2,3]);
      const bends = note.getModifiers().filter(m => m instanceof Bend);
      assert.equal(bends.length, 1);
      assert.equal(bends[0].getIndex(), 1, 'Only string three has the contour');
      assert.ok(event.label.includes('hold to 3/4'));
      const mute = parsed.spans.find(s => s.kind === 'palmMute');
      const pieces = layout.fragments.filter(f => view.sourceFor(f.id) === mute.id);
      assert.ok(pieces.length > 1);
      assert.deepEqual(pieces.map(f => f.strings), pieces.map(() => [6]));
      assert.equal(view.sourceFor(pieces[0].from), mute.from);
      assert.equal(view.sourceFor(pieces[pieces.length - 1].to), mute.to);
      const firstEnding = parsed.spans.find(s => s.kind === 'volta');
      const endings = [...view.navigation.regions, ...view.extraRegions].filter(r => r.source === firstEnding.id);
      assert.ok(endings.length > 1);
      assert.ok(guitar.slice(firstEnding.range.start, firstEnding.range.end).includes('ending 1 {'));
      if (part === 'score') {
        for (const [staff, tab] of view.composition.staves) {
          assert.equal(staff.getX(), tab.getX());
          assert.equal(staff.getWidth(), tab.getWidth());
        }
        assert.ok(layout.fragments.some(f => f.kind === 'tie' && f.part === 'last'));
      }
      const rest = parsed.measures[10].voices[1].events[1];
      const silent = view.navigation.events.find(e => e.source === rest.id && e.staff === 'tab');
      assert.equal(silent.duration, '1/2');
      assert.false(view.composition.getNote(silent.id).renderOptions.draw);
      const x = view.navigation.events.find(e => e.source === dead.id && e.staff === 'tab');
      assert.ok(x.label.includes('Muted strike on string 3'));
    }
    assert.deepEqual(geometry(renderScore(target, parsed, { width: 960 })), initial);
  });

  QUnit.test('The capo shifts written and sounding pitch while the displayed fret stays relative', assert => {
    for (const [tuning, capo, written, sounding] of [
      ['standard',0,'e/3','e/2'], ['dropD',0,'d/3','d/2'], ['dropD',2,'e/3','e/2'],
    ]) {
      const parsed = read('meter 1/4 guitar { tuning ' + tuning + ' capo ' + capo + ' 0/6 | }');
      const head = parsed.measures[0].voices[0].events[0].heads[0];
      assert.deepEqual([head.written, head.sounding, head.position], [written, sounding, {str:6, fret:0}]);
      const view = renderScore(host(), parsed);
      const tab = view.navigation.events.find(e => e.staff === 'tab');
      assert.ok(tab.label.includes('string 6 fret 0'));
      const metadata = view.composition.getNote(tab.id).notation;
      assert.ok(metadata[0].label.endsWith('capo ' + capo));
    }
  });

  QUnit.test('Dotted chord changes, a comma, a hyphen, an extender and the shape survive both widths', assert => {
    const parsed = read(lead);
    const target = host();
    const [first, second, third] = parsed.measures;
    assert.equal(parsed.measures.length, 12);
    assert.equal(third.state.key, 'G');
    const top = first.voices[0].events;
    assert.deepEqual([top[1].onset, top[1].duration, top[1].chord.text], ['1/4','3/8','Am/G']);
    assert.deepEqual(top[0].frame.spec.frets, ['x',0,2,2,1,0]);
    assert.deepEqual(top[0].frame.spec.barre, { fret:2, from:4, to:3 });
    const initial = geometry(renderScore(target, parsed, { width: 960 }));
    for (const width of [360, 960]) {
      const view = renderScore(target, parsed, { width });
      assert.deepEqual(view.diagnostics, []);
      for (const sys of view.composition.systems) assert.deepEqual(sys.getPhraseLayout().diagnostics, []);
      const starts = view.composition.sheet.getContinuousLayout().rows.map(row => row.measures[0]);
      assert.ok(starts.includes(7), 'The second six-bar line starts at its authored break');
      const fragments = view.composition.sheet.getContinuousLayout().fragments;
      assert.equal(fragments.filter(f => f.kind === 'hyphen' && f.row === 0 && f.x1 >= view.composition.staves[0][0].getX() && f.x1 < view.composition.staves[0][0].getX() + view.composition.staves[0][0].getWidth()).length, 1);
      const line = fragments.find(f => f.kind === 'lyric');
      const end = view.composition.getNote(view.navigation.events.find(e => e.source === second.voices[0].events[2].id).id) as StaveNote;
      assert.closeTo(line.x2, end.getAbsoluteX() + end.getGlyphWidth(), end.checkStave().space(1));
      for (const lower of view.composition.notes[1][0][1]) {
        const ink = measureEngraving(lower).ink;
        if (ink.x + ink.w > line.x1 && ink.x < line.x2) assert.true(line.y1 > ink.y + ink.h);
      }
      const chord = view.composition.getNote(view.navigation.events.find(e => e.source === top[1].id).id);
      assert.ok(chord.getModifiers().some(m => m instanceof Annotation && m.getText() === 'Am/G'));
      for (const label of ['Am', 'Am/G', 'Slow,']) {
        const texts = Array.from(target.querySelectorAll('text')).filter(t => t.textContent === label);
        assert.ok(texts.length && texts.every(t => getComputedStyle(t).fontFamily.split(',')[0].trim() === 'Academico'), label);
      }
      const frame = view.extraRegions.find(r => r.source.startsWith('frame'));
      assert.deepEqual(view.rangeFor(frame.id, lead), top[0].frame.range);
      assert.equal(view.hitTest(frame.x + 18, frame.y + 24).source, frame.source);
      if (width === 960) assert.deepEqual(geometry(view), initial);
    }
  });

  QUnit.test('A bad command points to the score, including CRLF and malformed span endpoints', assert => {
    for (const [source, token] of [
      [guitar.replace('rise=1/2','rise=4/4'), 'bend'],
      [guitar.replace('strings(6)','strings(9)'), '9'],
      [guitar.replace('ending 1 {','ending 3 {'), '3'],
      [lead.replace('barre=2/4..3','barre=2/4..2'), 'frame'],
      [lead.replace('x 0 2 2 1 0','x 0 2 3 1 0'), 'frame'],
      [lead.replace('extend=2','extend=99'), 'lyric'],
      ['meter 1/4 staff { C4 mark "Coda" | }','mark'],
    ]) {
      const text = source.replace(/\n/g, '\r\n');
      assert.throws(() => read(text), error => {
        const range = error.range;
        const [start, end] = Array.isArray(range) ? range : [range.start, range.end];
        return text.slice(start, end).startsWith(token);
      }, token);
    }
    const keys = read('meter 1/4 staff { key D at 2 voice one { F4 | F4 | F4 | } voice two { F4 | F4 | F4 | } }');
    assert.deepEqual(keys.measures.map(m => m.voices.map(v => v.events[0].heads[0].written)),
      [['f/4','f/4'],['f#/4','f#/4'],['f#/4','f#/4']]);
    const cramped = renderScore(host(), read(lead), { width: 100 });
    const overflow = cramped.diagnostics.find(d => d.code === 'RowOverflow');
    assert.deepEqual(overflow.range, read(lead).measures[overflow.measures[0] - 1].range);
    const text = 'meter 1/4 staff { C4[lyric "مرحبا"] | }';
    const warning = renderScore(host(), read(text)).diagnostics.find(d => d.code === 'UnsupportedScript');
    assert.equal(text.slice(warning.range.start, warning.range.end), 'lyric "مرحبا"');
  });

  QUnit.test('A timed gap splits its beam and preserves the adjacent beat', assert => {
    const target = host();
    const parsed = read('meter 2/4 staff { :16 C4 skip D4 E4 :8 F4 rest | }');
    const view = renderScore(target, parsed);
    const [c, gap, d, e, f, rest] = view.composition.notes[0][0][0] as StaveNote[];
    assert.notOk(c.getBeam());
    assert.notOk(gap.getBeam());
    assert.false(gap.renderOptions.draw);
    assert.deepEqual(d.getBeam().getNotes(), [d, e]);
    assert.deepEqual(f.getBeam().getNotes(), [f, rest]);
  });

  QUnit.test('A pre-bend stays on its chord head through reflow and independent publication', assert => {
    const src = 'meter 2/4 guitar { (5/2 7/3[prebend +1 release]) 7/3[prebend +2] | }';
    const target = host();
    const parsed = read(src);
    const [chord, held] = parsed.measures[0].voices[0].events;
    assert.deepEqual(chord.heads.map(h => h.sounding), ['e/4', 'd#/4']);
    assert.deepEqual(chord.heads[1].position, { str: 3, fret: 7 });
    assert.deepEqual(chord.heads[1].prebend, { semitones: 1, release: true });
    assert.deepEqual([chord.duration, held.onset, held.duration], ['1/4', '1/4', '1/4']);
    assert.equal(src.slice(held.range.start, held.range.end), '7/3[prebend +2]');
    for (const width of [320, 720]) {
      const result = renderScore(target, parsed, { width });
      const tab = result.navigation.events.find(e => e.source === chord.id && e.staff === 'tab');
      assert.ok(tab.label.includes('Pre-bend ½ on string 3, release'));
      assert.deepEqual(result.composition.getNote(tab.id).getModifiers().filter(m => m instanceof Bend).map(m => m.getIndex()), [1]);
    }
    for (const part of ['tab', 'notation'] as const) {
      const { publication } = renderScorePart(target, parsed, part);
      const page = publication.pages[0].svg;
      const text = [...page.querySelectorAll('text')].map(el => el.textContent);
      assert.ok(text.includes('Pre-bend ½ on string 3, release'), part);
      assert.ok(text.includes('Pre-bend full on string 3'), part);
      assert.ok(page.querySelector('metadata').textContent.includes('pre-bend'), part);
    }
  });

  QUnit.test('A printable tab gesture retains its string and envelope, and a lead sheet prints its chord frame', assert => {
    const src = 'meter 4/4 guitar { view tab capo 2 tabStems on palmMute strings(3) { :h (5/2 7/3[bend +2 rise=1/2 release=1]) (5/2 7/3) } | }';
    const target = host();
    const part = renderScorePart(target, read(src), 'tab');
    const meta = JSON.parse(part.publication.pages[0].svg.querySelector('metadata').textContent);
    assert.ok(JSON.stringify(meta.events[0]).includes('string-bend'));
    assert.deepEqual(meta.spans[0].strings, [3]);
    const sheet = renderScorePart(target, read(lead), 'notation').publication;
    assert.deepEqual(sheet.diagnostics, []);
    assert.ok(sheet.pages[0].svg.querySelector('.vf-fret-diagram'));
  });
});
