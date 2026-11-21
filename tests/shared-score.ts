// Cross-check the M2 source model, fixed Artist, composed views and independent parts.
import { Barline, Fraction, Renderer, TimeSignature, VexFlow } from 'vexflow';
import Artist from '../src/artist';
import Div from '../src/div';
import VexTab from '../src/vextab';
import { readScore } from './read-score';
import { parseScore, ScoreError } from '../src/score/parse';
import { renderScore, renderScorePart } from '../src/score/layout';
import type { SourceRange } from '../src/score/source';

const legacyPhrase = 'options tab-stems=true\ntabstave notation=true time=4/4\nnotes :q 0/3 ## :h (1/2.2/3) | :h T(2/3.1/2) :q 3-1/2 |';
const phrase = 'meter 4/4\nguitar { tabStems on 0/3 rest :h (1/2 2/3) |\n  :h (2/3[tie] 1/2[tie]) :q 3/2 1/2 | }';
function host() {
  const node = document.createElement('div');
  document.querySelector('#qunit-fixture').append(node);
  return node;
}

/** Render legacy scores through the public façade before inspecting actual engraving objects. */
function fixed(source: string) {
  const artist = new Artist(10, 0, 640);
  new VexTab(artist, { language: 1 }).parse(source);
  artist.draw(new Renderer(host(), Renderer.Backends.SVG));
  return artist;
}

function excerpt(source: string, range: SourceRange) { return source.slice(range.start, range.end); }

QUnit.module('Shared score', () => {
  QUnit.test('The two-bar phrase has the same attacks, positions and per-head ties in each renderer', assert => {
    const artist = fixed(legacyPhrase);
    const parsed = readScore(phrase);
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
    const parsed = readScore(source);
    const events = parsed.measures[1].voices[0].events;
    assert.deepEqual(events.map(e => excerpt(source, e.range)), ['(2/3[tie] 1/2[tie])', '3/2', '1/2']);
    assert.deepEqual(events[0].heads.map(h => excerpt(source, h.range)), ['2/3', '1/2']);
    assert.equal(events[0].range.line, 3);
    const wide = renderScore(host(), parsed, { width: 640 });
    const narrow = renderScore(host(), parsed, { width: 220 });
    assert.equal(wide.composition.sheet.getRows().length, 1);
    assert.equal(narrow.composition.sheet.getRows().length, 2);
    assert.deepEqual(narrow.tabRegions.map(r => r.row), [0,1,0,1]);
    assert.equal(narrow.composition.sheet.getContinuousLayout().fragments.length, 8);
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
    const source = 'meter 4/4 pickup 1/4 meter 3/4 at 3 guitar { display meter hidden display meter shown at 3 '
      + 'tuning dropD at 3 key D at 3 repeatStart 0/6 | :w 0/6 bar final break system :h. 0/6 | }';
    const parsed = readScore(source);
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
    const poly = readScore('staff { key D voice melody { fragment { rest Fn4 } } voice bass { fragment { Fn4 rest } } }');
    assert.equal(poly.measures[0].voices[0].events[1].heads[0].written, 'f/4');
    assert.equal(poly.measures[0].voices[1].span, '1/2');
    assert.equal(excerpt(poly.source, poly.measures[0].state.declaration), 'staff');
    assert.equal(excerpt(poly.source, poly.measures[0].voices[1].declaration), 'bass');
    const mixed = readScore('meter 1/4 guitar { 1/2[write C3] | }');
    const override = mixed.measures[0].voices[0].events[0].heads[0];
    assert.deepEqual([override.written, override.sounding], ['c/3','c/4']);
    for (const bad of ['staff { C4 | }', 'staff { voice a { fragment { :h C4 } } voice b { fragment { G4 } } }',
      'pickup 1/4 staff { :h C4 | }', 'staff { voice a { fragment { C4 | D4 } } voice b { fragment { E4 } } }']) {
      assert.throws(() => readScore(bad), e => ['bar-length','alignment'].includes(e.code) && e.range[1] > e.range[0]);
    }
  });

  QUnit.test('Tuplet timing survives hidden tab stems, rests, dots and serialized score data', assert => {
    const parsed = parseScore('meter 2/4 guitar { tabStems off tuplet 3:2 { :8 1/2 rest 3/2 } :8. 0/1 :16 1/1 | }');
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
      assert.throws(() => parseScore(source, { language: 1 }), (e: ScoreError) => e.code === 'fixed-layout' && excerpt(source, e.range).trim() === expected);
    }
    const target = host();
    const src = phrase.replace('tabStems on', 'tabStems on display meter hidden');
    const tab = renderScorePart(target, readScore(phrase), 'tab');
    const metadata = JSON.parse(tab.publication.pages[0].svg.querySelector('metadata').textContent);
    assert.deepEqual(metadata.spans.map(span => span.strings), [[3], [2]]);
    renderScorePart(target, readScore(src), 'notation');
    assert.equal(target.querySelectorAll('.vf-timesignature').length, 0);
    const dotted = 'meter 3/4 staff { :h. C4[symbol "C", lyric "home"] bar double }';
    renderScorePart(target, readScore(dotted), 'notation');
    assert.ok(target.textContent.includes('home'));
    assert.ok(target.textContent.includes('C'));
    const silent = 'meter 4/4 staff { :w skip | }';
    const blank = renderScorePart(target, readScore(silent), 'notation').publication.pages[0].svg;
    assert.equal(blank.querySelectorAll('.vf-notehead').length, 0);
    assert.throws(() => renderScorePart(target, readScore(silent), 'tab'), /No tab staff/);
    assert.strictEqual(target.firstChild, blank);
  });

  QUnit.test('An old selection cannot select a different note at the same offset', async assert => {
    const target = host();
    target.setAttribute('language', '2');
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
