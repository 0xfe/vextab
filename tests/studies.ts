// Exercise the exact guide scores through parsing, reflow, navigation and independent publication.
import { Annotation, Bend, StaveNote, TabNote, measureEngraving } from 'vexflow';
import guitar from '../guide/scores/drop-d-turnaround.vextab';
import lead from '../guide/scores/slow-river.vextab';
import { renderScore, renderScorePart } from '../src/score/layout';
import { parseScore, ScoreError } from '../src/score/parse';

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
    const parsed = parseScore(guitar);
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
      const view = renderScore(target, parsed, { width: 360, part });
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
      assert.equal(guitar.slice(firstEnding.range.start, firstEnding.range.end), '!ending 1 bars=4!');
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
      ['standard',0,'e/3','e/2'], ['dropd',0,'d/3','d/2'], ['dropd',2,'e/3','e/2'],
    ]) {
      const parsed = parseScore('tabstave notation=true time=1/4 tuning=' + tuning + ' capo=' + capo + '\nnotes 0/6');
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
    const parsed = parseScore(lead);
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
      assert.ok(starts.includes(5) && starts.includes(9), 'The two authored line breaks survive reflow');
      assert.equal(view.composition.systems[0].getPhraseLayout().getLyricConnectors().length, 1);
      const line = view.composition.systems[1].getPhraseLayout().getLyricConnectors()[0];
      const end = view.composition.getNote(view.navigation.events.find(e => e.source === second.voices[0].events[2].id).id) as StaveNote;
      assert.closeTo(line.x + line.w, end.getNoteHeadBeginX() + end.getGlyphWidth(), 0.01);
      for (const lower of view.composition.notes[1][0][1]) {
        const ink = measureEngraving(lower).ink;
        if (ink.x + ink.w > line.x && ink.x < line.x + line.w) assert.true(line.y > ink.y + ink.h);
      }
      const chord = view.composition.getNote(view.navigation.events.find(e => e.source === top[1].id).id);
      assert.ok(chord.getModifiers().some(m => m instanceof Annotation && m.getText() === 'Am/G'));
      assert.ok(target.textContent.includes('Slow,'));
      const frame = view.extraRegions.find(r => r.source.startsWith('frame'));
      assert.deepEqual(view.rangeFor(frame.id, lead), top[0].frame.range);
      assert.equal(view.hitTest(frame.x + 18, frame.y + 24).source, frame.source);
      if (width === 960) assert.deepEqual(geometry(view), initial);
    }
  });

  QUnit.test('A bad command points to the score, including CRLF and malformed span endpoints', assert => {
    for (const [source, token] of [
      [guitar.replace('rise=1/2','rise=4/4'),'!bend'],
      [guitar.replace('bend 3','bend 4'),'!bend'],
      [guitar.replace('!pm 6!', '!pm 2!'),'!pm 2!'],
      [guitar.replace('!end-pm!', ''),'!pm 6!'],
      [guitar.replace('1 bars=4','1 bars=14'),'!ending'],
      [lead.replace('barre=2:4-3','barre=2:4-2'),'!frame'],
      [lead.replace('x,0,2,2,1,0','x,0,2,3,1,0'),'!frame'],
      [lead.replace('extend=2','extend=20'),'!lyric "roll"'],
      [lead.replace(':q B/4 A/4', ':q B/4 !key D! A/4'),'!key D!'],
      ['stave time=1/4\nnotes C/4 | !mark "Coda"!','!mark'],
      ['stave time=1/4\nnotes ## !silent! !chord "Dm"!','!chord'],
      ['tabstave time=1/4\nnotes X/3 !chord "Am"! !frame x,x,x,x,x,x!','!frame'],
    ]) {
      const text = source.replace(/\n/g, '\r\n');
      assert.throws(() => parseScore(text), (e: ScoreError) => e.code === 'syntax' && text.slice(e.range.start,e.range.end).startsWith(token));
    }
    const keys = parseScore('stave time=1/4\nnotes F/4 | !key D! F/4 | F/4\nvoice\nnotes F/4 | F/4 | F/4');
    assert.deepEqual(keys.measures.map(m => m.voices.map(v => v.events[0].heads[0].written)),
      [['f/4','f/4'],['f#/4','f#/4'],['f#/4','f#/4']]);
    const cramped = renderScore(host(), parseScore(lead), { width: 100 });
    const overflow = cramped.diagnostics.find(d => d.code === 'RowOverflow');
    assert.deepEqual(overflow.range, parseScore(lead).measures[overflow.measures[0] - 1].range);
    const text = 'stave time=1/4\nnotes C/4 !lyric "مرحبا"!';
    const warning = renderScore(host(), parseScore(text)).diagnostics.find(d => d.code === 'UnsupportedScript');
    assert.equal(text.slice(warning.range.start, warning.range.end), '!lyric "مرحبا"!');
  });

  QUnit.test('A timed gap splits its beam and preserves the adjacent beat', assert => {
    const target = host();
    const parsed = parseScore('stave time=2/4\nnotes :16 C/4 ## !silent! D-E/4 :8 F/4 ##');
    const view = renderScore(target, parsed);
    const [c, gap, d, e, f, rest] = view.composition.notes[0][0][0] as StaveNote[];
    assert.notOk(c.getBeam());
    assert.notOk(gap.getBeam());
    assert.false(gap.renderOptions.draw);
    assert.deepEqual(d.getBeam().getNotes(), [d, e]);
    assert.deepEqual(f.getBeam().getNotes(), [f, rest]);
  });

  QUnit.test('A printable tab gesture retains its string and envelope, and unsupported print attachments are located', assert => {
    const src = 'options tab-stems=true\ntabstave time=4/4 capo=2\nnotes :h (5/2.7/3) !bend 3 +2 rise=1/2 release=1/1! !pm 3! (5/2.7/3) !end-pm!';
    const target = host();
    const part = renderScorePart(target, parseScore(src), 'tab');
    const meta = JSON.parse(part.publication.pages[0].svg.querySelector('metadata').textContent);
    assert.ok(JSON.stringify(meta.events[0]).includes('string-bend'));
    assert.deepEqual(meta.spans[0].strings, [3]);
    const page = target.firstChild;
    assert.throws(() => renderScorePart(target, parseScore(lead), 'notation'),
      (e: ScoreError) => e.code === 'fixed-layout' && lead.slice(e.range.start,e.range.end).startsWith('!frame'));
    assert.strictEqual(target.firstChild, page);
  });
});
