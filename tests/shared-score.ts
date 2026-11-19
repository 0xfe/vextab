// Cross-check the M2 source model, fixed Artist, composed views and independent parts.
import { Barline, Fraction, Renderer, TimeSignature, VexFlow } from 'vexflow';
import Artist from '../src/artist';
import Div from '../src/div';
import VexTab from '../src/vextab';
import { parseScore, ScoreError } from '../src/score/parse';
import { renderScore, renderScorePart } from '../src/score/layout';
import type { SourceRange } from '../src/score/source';

const phrase = 'options tab-stems=true\ntabstave notation=true time=4/4\nnotes :q 0/3 ## :h (1/2.2/3) | :h T(2/3.1/2) :q 3-1/2 |';
function host() {
  const node = document.createElement('div');
  document.querySelector('#qunit-fixture').append(node);
  return node;
}

/** Render legacy scores through the public façade before inspecting actual engraving objects. */
function fixed(source: string) {
  const artist = new Artist(10, 0, 640);
  new VexTab(artist).parse(source);
  artist.draw(new Renderer(host(), Renderer.Backends.SVG));
  return artist;
}

function excerpt(source: string, range: SourceRange) { return source.slice(range.start, range.end); }

QUnit.module('Shared score', () => {
  QUnit.test('The two-bar phrase has the same attacks, positions and per-head ties in each renderer', assert => {
    const artist = fixed(phrase);
    const parsed = parseScore(phrase);
    const result = renderScore(host(), parsed, { width: 640 });
    const sourceEvents = parsed.measures.flatMap(m => m.voices[0].events);
    const legacy = artist.staves[0];
    const fixedPitches = legacy.note_notes.filter(n => !n.shouldIgnoreTicks());
    const fixedTab = legacy.tab_notes.filter(n => !n.shouldIgnoreTicks());
    let index = 0;
    for (const measure of parsed.measures) {
      const clock = new Fraction(0, 1);
      for (const event of measure.voices[0].events) {
        const note = fixedPitches[index], tab = fixedTab[index++];
        const duration = note.getTicks().clone().divide(VexFlow.RESOLUTION).simplify();
        assert.equal(event.onset, clock.simplify().toString());
        assert.equal(event.duration, duration.toString());
        clock.add(duration);
        const projected = result.navigation.events.filter(e => e.source === event.id);
        assert.deepEqual(projected.map(e => [e.staff, e.onset, e.duration]), [
          ['notation', event.onset, event.duration], ['tab', event.onset, event.duration]]);
        const written = event.heads.map(h => h.written);
        const positions = event.heads.map(h => h.position);
        if (written.length) {
          assert.deepEqual(note.getKeys().map(k => k.toLowerCase()), written);
          assert.deepEqual(result.composition.getNote(projected[0].id).getKeys(), written);
          for (const rendered of [tab, result.composition.getNote(projected[1].id)]) {
            assert.deepEqual(rendered.getPositions().map(p => ({ str: +p.str, fret: +p.fret })), positions);
          }
        } else assert.true(note.isRest());
      }
    }
    assert.deepEqual(sourceEvents.map(e => e.heads.map(h => h.sounding)),
      [['g/3'], [], ['c/4', 'a/3'], ['a/3', 'c/4'], ['d/4'], ['c/4']]);
    const tie = artist.stave_articulations.find(mark => mark.getCategory() === 'StaveTie').getNotes();
    assert.strictEqual(tie.firstNote, fixedPitches[2]);
    assert.strictEqual(tie.lastNote, fixedPitches[3]);
    assert.deepEqual(parsed.ties.map(t => [t.from, t.to, t.fromHead, t.toHead]),
      tie.firstIndexes.map((first, i) => [sourceEvents[2].id, sourceEvents[3].id, first, tie.lastIndexes[i]]));
    assert.deepEqual(result.diagnostics, []);
  });

  QUnit.test('Reflow, independent page metadata and hit targets resolve to the original CRLF revision', assert => {
    const source = phrase.replace(/\n/g, '\r\n');
    const parsed = parseScore(source);
    const events = parsed.measures[1].voices[0].events;
    assert.deepEqual(events.map(e => excerpt(source, e.range)), ['T(2/3.1/2)', '3', '-1/2']);
    assert.deepEqual(events[0].heads.map(h => excerpt(source, h.range)), ['2/3', '1/2']);
    assert.equal(events[0].range.line, 3);
    const wide = renderScore(host(), parsed, { width: 640 });
    const narrow = renderScore(host(), parsed, { width: 220 });
    assert.equal(wide.composition.sheet.getRows().length, 1);
    assert.equal(narrow.composition.sheet.getRows().length, 2);
    assert.deepEqual(narrow.tabRegions.map(r => r.row), [0,1,0,1]);
    assert.equal(narrow.composition.sheet.getContinuousLayout().fragments.length, 4);
    const event = events[0];
    for (const view of [wide, narrow]) {
      const projections = view.navigation.events.filter(e => e.source === event.id);
      assert.equal(new Set(projections.map(e => e.id)).size, 2);
      for (const { id } of projections) {
        const region = view.navigation.regions.find(r => r.id === id);
        assert.equal(view.hitTest(region.x + region.w / 2, region.y + region.h / 2)?.source, event.id);
        assert.deepEqual(view.rangeFor(id, source), event.range);
        assert.strictEqual(view.rangeFor(id, source + ' '), undefined);
      }
    }
    assert.notEqual(wide.navigation.events[0].id, narrow.navigation.events[0].id);
    const part = renderScorePart(host(), parsed, 'notation');
    assert.deepEqual(part.publication.diagnostics, []);
    const page = JSON.parse(part.publication.pages[0].svg.querySelector('metadata').textContent);
    assert.deepEqual(page.staves, ['notation']);
    assert.equal(page.events.length, 6);
    assert.equal(page.spans.length, 2);
    assert.deepEqual(part.rangeFor(page.events[3].id, source), event.range);
    assert.deepEqual(part.rangeFor(page.spans[0].id, source), parsed.ties[0].range);
    assert.strictEqual(part.rangeFor(page.events[3].id, source.slice(1)), undefined);
  });

  QUnit.test('Meter, pickup, aligned voices, signatures, tuning and boundary scope', assert => {
    const source = 'tabstave notation=true time=4/4 pickup=1/4 show-time=false\nnotes =|: :q 0/6 | :w 0/6 =|='
      + '\ntabstave notation=true tuning=dropd key=D time=3/4\nnotes :hd 0/6 |';
    const parsed = parseScore(source);
    const [pickup, full, change] = parsed.measures;
    assert.deepEqual(parsed.measures.map(m => m.span), ['1/4','1/1','3/4']);
    assert.deepEqual([pickup.state.showTime, full.state.meter, change.state.key, change.state.showTime], [false,'4/4','D',true]);
    assert.deepEqual([full, change].map(m => m.voices[0].events[0].heads[0].written), ['e/3', 'd/3']);
    assert.deepEqual([full, change].map(m => m.voices[0].events[0].heads[0].sounding), ['e/2', 'd/2']);
    const view = renderScore(host(), parsed, { width: 640 });
    assert.false(view.composition.staves[0][0].getModifiers().some(m => m instanceof TimeSignature));
    assert.true(view.composition.staves[2][0].getModifiers().some(m => m instanceof TimeSignature));
    assert.equal((view.composition.staves[0][0].getModifiers()[0] as Barline).getType(), Barline.type.REPEAT_BEGIN);
    assert.equal((view.composition.staves[1][0].getModifiers()[1] as Barline).getType(), Barline.type.END);
    const poly = parseScore('stave fragment=true key=D\nnotes :q ## F/4\nvoice\nnotes :q Fn/4 ## |');
    assert.equal(poly.measures[0].voices[0].events[1].heads[0].written, 'f/4');
    assert.equal(poly.measures[0].voices[1].span, '1/2');
    assert.equal(excerpt(poly.source, poly.measures[0].state.declaration), 'stave fragment=true key=D');
    assert.equal(excerpt(poly.source, poly.measures[0].voices[1].declaration), 'voice');
    const mixed = parseScore('tabstave notation=true time=1/4\nnotes C3_1/2');
    const override = mixed.measures[0].voices[0].events[0].heads[0];
    assert.deepEqual([override.written, override.sounding], ['c/3','c/4']);
    for (const bad of ['stave\nnotes C/4 |', 'stave fragment=true\nnotes :h C/4\nvoice\nnotes :q G/4 |',
      'stave pickup=1/4\nnotes :h C/4 |', 'stave fragment=true\nnotes C/4 | D/4\nvoice\nnotes E/4 |']) {
      assert.throws(() => parseScore(bad), (e: ScoreError) => e.code === 'measure' && e.range.end > e.range.start);
    }
  });

  QUnit.test('Tuplet timing survives hidden tab stems, rests, dots and serialized score data', assert => {
    const parsed = parseScore('tabstave notation=true time=2/4\nnotes :8 1/2 ## 3/2 ^3^ :8d 0/1 :16 1/1 |');
    const copy = JSON.parse(JSON.stringify(parsed));
    const view = renderScore(host(), copy);
    for (const staff of ['notation','tab']) {
      assert.deepEqual(view.navigation.events.filter(e => e.staff === staff).map(e => e.duration),
        ['1/12','1/12','1/12','3/16','1/16']);
    }
  });

  QUnit.test('Unsupported views identify the original construct and preserve the prior page', assert => {
    for (const [source, expected] of [
      ['tabstave\nnotes (5/1.7/2) b(7/1.7/2)', 'b(7/1.7/2)'],
      ['stave\ntext :q,Hello\nnotes :w G/4 |', 'text :q,Hello'],
    ]) {
      assert.ok(fixed(source).staves[0]);
      assert.throws(() => parseScore(source), (e: ScoreError) => e.code === 'fixed-layout' && excerpt(source, e.range).trim() === expected);
    }
    const target = host();
    const src = phrase.replace('time=4/4', 'time=4/4 show-time=false');
    renderScorePart(target, parseScore(phrase), 'notation');
    const page = target.firstChild;
    assert.throws(() => renderScorePart(target, parseScore(phrase), 'tab'),
      (e: ScoreError) => e.code === 'fixed-layout' && excerpt(phrase, e.range) === 'T(2/3.1/2)');
    assert.throws(() => renderScorePart(target, parseScore(src), 'notation'),
      (e: ScoreError) => e.code === 'fixed-layout' && excerpt(src, e.range) === 'show-time=false');
    const dotted = 'stave time=3/4\nnotes :hd C/4';
    assert.throws(() => renderScorePart(target, parseScore(dotted), 'notation'),
      (e: ScoreError) => e.code === 'fixed-layout' && excerpt(dotted, e.range) === ':hd');
    assert.strictEqual(target.firstChild, page);
  });

  QUnit.test('An old selection cannot select a different note at the same offset', async assert => {
    const target = host();
    target.setAttribute('layout', 'flow');
    target.setAttribute('editor', 'true');
    target.textContent = phrase;
    const editor = new Div(target);
    const first = editor.getScore();
    const id = first.measures[0].voices[0].events[0].id;
    const input = target.querySelector('textarea');
    input.value = phrase.replace('0/3', '2/3');
    input.dispatchEvent(new Event('input'));
    assert.false(editor.selectSource(id, first));
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.false(editor.selectSource(id, first));
    assert.true(editor.selectSource(id, editor.getScore()));
    assert.equal(input.value.slice(input.selectionStart, input.selectionEnd), '2/3');
  });
});
