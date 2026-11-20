// Exercise the historical score families through the public grammar v2 browser APIs.
import { Artist, parseScore, renderScore, renderScorePart, Vex, VexTab } from '../src/browser';
import { Clef, VexFlow } from 'vexflow';
import { scorePerformance } from '../src/playback/performance';

/** Each independent surface needs its own VexFlow objects. */
function host() {
  return document.querySelector('#qunit-fixture').appendChild(document.createElement('div'));
}
const read = (s: string) => parseScore(s, { language: 2 });

/** Measure the actual legacy drawing when the shared v1 parser cannot describe a feature. */
function fixed(source: string) {
  const surface = host(), artist = new Artist(10, 0, 560);
  new VexTab(artist).parse(source);
  artist.draw(new Vex.Flow.Renderer(surface, Vex.Flow.Renderer.Backends.SVG));
  return surface;
}

/** Measure painted text rather than SVG's much taller font line box. */
function textInk(text: SVGTextElement) {
  const style = getComputedStyle(text), context = document.createElement('canvas').getContext('2d');
  context.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
  const m = context.measureText(text.textContent), x = Number(text.getAttribute('x')), y = Number(text.getAttribute('y'));
  return { left: x - m.actualBoundingBoxLeft, right: x + m.actualBoundingBoxRight,
    top: y - m.actualBoundingBoxAscent, bottom: y + m.actualBoundingBoxDescent };
}

QUnit.module('Grammar v2 historical parity', () => {
  QUnit.test('shared meter changes, deliberate fragments and blank staves', assert => {
    const score = read('meter 2/4 meter 3/8 at 2 staff { :h C4 | break system :8 D4 E4 F4 bar final }');
    const view = renderScore(host(), score, { width: 600 });
    assert.deepEqual(view.score.measures.map(m => [m.state.meter, m.span]), [['2/4', '1/2'], ['3/8', '3/8']]);
    assert.equal(view.composition.sheet.getRows().length, 2);
    assert.equal(view.score.measures[1].voices[0].closing.type, 'end');
    assert.equal(renderScorePart(host(), score, 'notation').publication.diagnostics.length, 0);
    const partial = renderScore(host(), read('staff { fragment { :8 C4 D4 E4 } }')).score;
    assert.equal(partial.measures[0].span, '3/8');
    assert.equal(scorePerformance(partial, 60).duration, 1.5);
    const blank = read('guitar { fragment {} }');
    for (const renderer of ['svg', 'canvas'] as const) {
      const surface = host(), result = renderScore(surface, blank, { renderer });
      assert.ok(surface.querySelector(renderer));
      assert.deepEqual(scorePerformance(result.score, 60), { events: [], duration: 0 });
      assert.equal(surface.querySelectorAll('.vf-notehead').length, 0);
    }
    assert.equal(renderScorePart(host(), blank, 'tab').publication.diagnostics.length, 0);
    assert.throws(() => read('staff { voice a { fragment { C4 } } voice b { fragment { :h E4 } } }'), /length of bar/);
    assert.throws(() => read('staff { :8 C4 D4 E4 | }'), /expected 4\/4/i);
  });

  QUnit.test('four-string TAB clef ink fits blank, wrapped and published staves', assert => {
    const tuning = 'guitar { view tab tuning (G4 D4 A3 E3) ';
    for (const source of [tuning + 'fragment {} }', tuning + ':w 0/4 | break system 0/3 | }']) {
      const score = read(source);
      for (const renderer of ['svg', 'canvas'] as const) {
        const root = host(), view = renderScore(root, score, { width: 330, renderer });
        for (const [stave] of view.composition.staves) {
          const [clef] = stave.getModifiers(undefined, Clef.CATEGORY) as Clef[];
          const ink = clef.getInkBounds();
          assert.equal(clef.getText(), VexFlow.Glyphs.fourStringTabClef);
          assert.ok(ink.h > 25 && ink.y >= stave.getYForLine(0) - 0.5 && ink.y + ink.h <= stave.getYForLine(3) + 0.5);
        }
      }
      const svg = renderScorePart(host(), score, 'tab').publication.pages[0].svg;
      const clefs = [...svg.querySelectorAll<SVGTextElement>('.vf-clef text')];
      const staves = [...svg.querySelectorAll('.vf-stave')];
      assert.equal(clefs.length, staves.length);
      for (const [index, clef] of clefs.entries()) {
        const lines = [...staves[index].querySelectorAll('path')].map(p => p.getBBox().y);
        const ink = textInk(clef);
        assert.equal(clef.textContent, VexFlow.Glyphs.fourStringTabClef);
        assert.ok(ink.top >= Math.min(...lines) - 0.5 && ink.bottom <= Math.max(...lines) + 0.5);
      }
    }
    const six = renderScore(host(), read('guitar { view tab fragment {} }'));
    const [clef] = six.composition.staves[0][0].getModifiers(undefined, Clef.CATEGORY) as Clef[];
    assert.equal(clef.getText(), VexFlow.Glyphs.sixStringTabClef);
  });

  QUnit.test('timed signs keep their music glyphs and clear the words, notes and barlines', assert => {
    const source = 'meter 2/4 staff { :h C4 | text words line 8 font "Georgia" size 14 style italic ink navy { start sign coda :8 "One," "and" ink crimson "three" "four" end sign segno | } }';
    const score = read(source);
    const inspect = (svg: SVGSVGElement) => {
      const labels = [...svg.querySelectorAll<SVGTextElement>('.vf-timed-text text')];
      const coda = labels.find(label => label.textContent === VexFlow.Glyphs.coda);
      const segno = labels.find(label => label.textContent === VexFlow.Glyphs.segno);
      const words = labels.filter(label => label !== coda && label !== segno);
      assert.ok(getComputedStyle(coda).fontFamily.includes('Bravura') && getComputedStyle(segno).fontFamily.includes('Bravura'));
      assert.ok(words.every(word => getComputedStyle(word).fontFamily.includes('Georgia')));
      const boxes = [coda, ...words, segno].map(textInk);
      for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].left > boxes[i - 1].right, 'separate horizontal ink ' + i);
      const staff = svg.querySelector<SVGGraphicsElement>('.vf-stave').getBBox();
      assert.ok(boxes[0].left >= staff.x && boxes[boxes.length - 1].right <= staff.x + staff.width + 0.5, 'edge marks inside bar');
      const note = svg.querySelector<SVGTextElement>('.vf-notehead text');
      assert.ok(boxes.every(box => box.top > textInk(note).bottom), 'lyric lane below the ledger note');
    };
    for (const width of [290, 540]) {
      const root = host(), view = renderScore(root, score, { width });
      inspect(root.querySelector('svg'));
      for (const region of view.extraRegions) {
        const hit = view.hitTest(region.x + region.w / 2, region.y + region.h / 2);
        assert.equal(hit.id, region.id, 'each word or sign selects its source');
      }
      const canvas = renderScore(host(), score, { width, renderer: 'canvas' });
      assert.deepEqual(canvas.extraRegions.map(r => [r.x, r.y, r.w, r.h]), view.extraRegions.map(r => [r.x, r.y, r.w, r.h]));
    }
    inspect(renderScorePart(host(), score, 'notation').publication.pages[0].svg);
  });

  QUnit.test('scoped transposition keeps diagram, symbol, fret, string and performed notes together', assert => {
    const legacy = parseScore('options transpose=2\ntabstave notation=true time=2/4\nnotes :h (0/5.2/4.2/3.1/2.0/1) !chord "Am/E"! !frame x,0,2,2,1,0 barre=2:4-3! |');
    const input = 'meter 2/4 guitar { transpose +2 { :h (0/5 2/4 2/3 1/2 0/1)[symbol "Am/E", frame (x 0 2 2 1 0) barre=2/4..3] | } :h 0/5 | }';
    const root = host(), result = renderScore(root, read(input));
    const attack = result.score.measures[0].voices[0].events[0], old = legacy.measures[0].voices[0].events[0];
    assert.deepEqual(attack.heads.map(h => h.position), old.heads.map(h => h.position));
    assert.deepEqual(attack.frame.spec, old.frame.spec);
    assert.equal(attack.chord.text, old.chord.text);
    assert.deepEqual(scorePerformance(result.score, 60).events[0].notes, scorePerformance(legacy, 60).events[0].notes);
    assert.equal(result.score.measures[1].voices[0].events[0].heads[0].position.fret, 0);
    assert.throws(() => renderScore(host(), read('guitar { transpose -2 { :w 0/6 | } }')), /original string/);
    assert.throws(() => renderScorePart(host(), read(input), 'tab'), /chord frame/);
  });

  QUnit.test('native tab gestures, manual beams, slurs and a cross-bar palm mute', assert => {
    const old = fixed('tabstave notation=true\nnotes :8 5h7p5/3 7s5/4 :q 3V/5 X/3 |');
    const phrase = 'guitar { fragment { :8 5/3 7/3[hammer] 5/3[pull] 7/4 5/4[slide] :q 3/5[vibrato wide] x/3[write B3] } }';
    const root = host(), view = renderScore(root, read(phrase));
    assert.deepEqual(view.score.spans.map(s => s.kind), ['hammer', 'pull', 'slide']);
    assert.ok(root.textContent.includes('P') && old.textContent.includes('P'));
    const paper = renderScorePart(host(), read(phrase), 'tab').publication.pages[0].svg;
    for (const mark of ['P', 'Slide', 'Wide vibrato']) assert.ok(paper.textContent.includes(mark), mark);
    const passage = read('guitar { palmMute strings(6) { :h 0/6 2/6 | :w 3/6 | } }');
    for (const width of [620, 200]) {
      const view = renderScore(host(), passage, { width });
      const mute = view.score.spans[0];
      assert.ok(mute.kind === 'palmMute' && mute.strings[0] === 6);
      assert.equal(mute.to, view.score.measures[1].voices[0].events[0].id);
    }
    const root2 = host(), beams = read('staff { :8 beam { C4 D4 E4 F4 } slur { G4 F4 E4 D4 } | }');
    renderScore(root2, beams);
    assert.ok(root2.querySelector('.vf-beam'));
    assert.throws(() => renderScorePart(host(), beams, 'notation'), /explicit beam groups/);
  });

  QUnit.test('two bend contours sound independently in a three-string chord', assert => {
    const score = read('guitar { :w (0/6 5/2[bend +1 rise=1/2] 7/3[bend +2 rise=1/4 release=1]) | }');
    const view = renderScore(host(), score);
    assert.deepEqual(scorePerformance(view.score, 60).events[0].notes.map(n => n.bend ?? []),
      [[], [{ time: 2, semitones: 1 }], [{ time: 1, semitones: 2 }, { time: 4, semitones: 0 }]]);
    assert.equal(renderScorePart(host(), score, 'tab').publication.pages.length, 1);
  });

  QUnit.test('timed labels, boundary signs, font changes and selection survive reflow and print', assert => {
    const input = 'meter 2/4 staff { :h C4 | text words font "Georgia" size 14 style italic ink navy line 0 spacing strict { start sign coda :8 "One," "and" line 8 ink red "three" "four" end sign segno | } }';
    const score = read(input), surface = host(), view = renderScore(surface, score);
    const native = fixed('stave time=2/4\nnotes :h C/4 |\ntext :8,One,and,three,four');
    assert.ok(native.textContent.includes('three'));
    const labels = [...surface.querySelectorAll<SVGGElement>('.vf-timed-text')];
    assert.equal(labels.length, 6);
    const three = labels.find(g => g.textContent === 'three').querySelector('text');
    const one = labels.find(g => g.textContent === 'One,').querySelector('text');
    assert.equal(three.getAttribute('font-family'), 'Georgia');
    assert.ok(Number(three.getAttribute('y')) > Number(one.getAttribute('y')));
    const hit = view.extraRegions.find(r => input.slice(view.rangeFor(r.id, input)?.start, view.rangeFor(r.id, input)?.end) === '"three"');
    assert.ok(hit && view.hitTest(hit.x + hit.w / 2, hit.y + hit.h / 2).id === hit.id);
    assert.equal(scorePerformance(view.score, 60).events.length, 1);
    const page = renderScorePart(host(), score, 'notation').publication.pages[0].svg;
    assert.equal(page.querySelectorAll('.vf-timed-text').length, 6);
    assert.ok(page.textContent.includes('One,'));
  });

  QUnit.test('a migrated lead sheet preserves written bars, chord diagrams, lyrics and both voices', assert => {
    const old = parseScore('options measure-numbers=true\nstave time=4/4 voice=top\nnotes :q (0/5.2/4.2/3.1/2.0/1) !chord "Am"! !frame x,0,2,2,1,0 barre=2:4-3! !lyric "Slow,"! :qSd X/5 !chord "Am/G"! !lyric "riv" -! :8S X/5 !lyric "er"! :qS X/5 |\nvoice voice=bottom\nnotes :h A/3 G/3 |');
    const score = read('measureNumbers on meter 4/4 guitar { view notation voice upper { (0/5 2/4 2/3 1/2 0/1)[symbol "Am", frame (x 0 2 2 1 0) barre=2/4..3, lyric "Slow,"] :q. slash[symbol "Am/G", lyric "riv" hyphen] :8 slash[lyric "er"] :q slash | } voice lower { :h A3 G3 | } }');
    const root = host(), v = renderScore(root, score);
    const music = model => scorePerformance(model, 60).events.map(e => [e.time, e.duration, e.notes]);
    assert.deepEqual(music(v.score), music(old));
    const text = e => [e.onset, e.duration, e.chord?.text, e.lyric?.text, e.lyric?.hyphen];
    assert.deepEqual(v.score.measures[0].voices[0].events.map(text), old.measures[0].voices[0].events.map(text));
    assert.ok(root.textContent.includes('Slow,') && root.textContent.includes('Am/G'));
    assert.ok(v.extraRegions.some(r => r.source.startsWith('frame')));
  });

  QUnit.test('a written repeat has aligned boundaries, beam groups, layout and playback on both backends', assert => {
    const input = 'layout { width 490 rowGap 44 staffDistance 8 } meter 6/8 guitar { view tab tabStems on tabDirection down groupBeats (3 3) repeatStart mark "A" :8 0/6 2/6 3/6 0/5 2/5 3/5 bar repeatEnd }';
    const score = read(input);
    const before = parseScore('options tab-stems=true\ntabstave time=6/8\nnotes =|: !mark "A"! :8 0-2-3/6 0-2-3/5 =:|');
    for (const renderer of ['svg', 'canvas'] as const) {
      const view = renderScore(host(), score, { renderer });
      const voice = view.score.measures[0].voices[0];
      assert.equal(voice.rehearsal, 'A');
      assert.deepEqual([voice.opening.type, voice.closing.type], ['repeat-begin', 'repeat-end']);
      assert.deepEqual(scorePerformance(view.score, 60).events.map(e => e.notes), scorePerformance(before, 60).events.map(e => e.notes));
      assert.deepEqual(voice.beatGroups, [3, 3]);
    }
    assert.equal(renderScorePart(host(), score, 'tab').publication.pages.length, 1);
  });

  QUnit.test('named ties sustain in musical order and octave shifts preserve the written fret', assert => {
    const score = read('meter 3+2/8 staff { voice upper { :8 rest rest C4[tieEnd bass] rest rest | } voice lower { :8 C4[tieStart bass] rest rest rest rest | } }');
    const root = host(), part = renderScore(root, score);
    assert.equal(part.score.measures[0].span, '5/8');
    const sounding = scorePerformance(part.score, 60).events.flatMap(e => e.notes);
    assert.deepEqual(sounding.map(n => [n.pitch, n.duration]), [[60, 1.5]]);
    assert.equal(renderScorePart(host(), score, 'notation').publication.pages.length, 1);
    const shifted = renderScore(host(), read('meter cut guitar { octave +1 { :h 0/6 } :h 0/6 | }'));
    const heads = shifted.score.measures[0].voices[0].events.map(e => e.heads[0]);
    assert.equal(heads[0].written, heads[1].written);
    assert.deepEqual(heads[0].position, heads[1].position);
    assert.deepEqual(scorePerformance(shifted.score, 60).events.map(e => e.notes[0].pitch), [52, 40]);
  });

  QUnit.test('historical chord marks survive reordering, playback and the selected staff', assert => {
    const music = read('meter 2/4 guitar { :q (2/2[stringNumber 2 right] 0/3[finger p below])[roll down] (0/3 2/2)[tap, accent below] | }');
    const root = host(), view = renderScore(root, music);
    const events = view.score.measures[0].voices[0].events;
    assert.deepEqual(events[0].heads.map(h => h.marks[0].finger), ['2', 'p']);
    assert.equal(events[0].heads[0].marks[0].stringNumber, true);
    assert.ok(root.textContent.includes('T'));
    const page = renderScorePart(host(), read('guitar { :h (2/2 0/3)[brush up] (0/3 2/2)[tap] | }'), 'tab').publication.pages[0].svg;
    assert.ok(page.textContent.includes('brush up') && page.textContent.includes('T'));

    const transposed = renderScore(host(), read('transpose +2 meter 2/4 staff { key D key G at 2 :h F4 | F4 | }'));
    assert.deepEqual(transposed.score.measures.map(m => m.state.key), ['E', 'A']);
    assert.deepEqual(scorePerformance(transposed.score, 60).events.map(e => e.notes[0].pitch), [68, 68]);
  });

  QUnit.test('keys, forced signs, colored notation, slash heads and silent rests', assert => {
    const input = 'measureNumbers on play { tempo 84 instrument 24 } meter 2/4 staff { key D key F at 2 ink navy :q F4[courtesy, ink crimson] rest[line -1] | slash[symbol "Bb" ink green] Bb4[label "Hold" font "Georgia" ink teal] | }';
    const root = host(), score = read(input), view = renderScore(root, score);
    const [one, two] = view.score.measures;
    assert.equal(one.voices[0].events[0].heads[0].written, 'f#/4');
    assert.ok(one.voices[0].events[0].heads[0].cautionary);
    assert.equal(one.voices[0].events[1].restLine, -1);
    assert.equal(two.state.key, 'F');
    assert.equal(two.voices[0].events[0].chord.color, 'green');
    assert.ok(two.voices[0].events[0].slash);
    assert.deepEqual(scorePerformance(view.score, 60).events.map(e => e.notes.length), [1, 0, 0, 1]);
    assert.deepEqual(view.score.playback, { enabled: true, tempo: 84, instrument: '24' });
    assert.ok(root.querySelector('[fill="crimson"]'));
    assert.ok(root.textContent.includes('Hold'));
    const paper = renderScorePart(host(), read('staff { :w C4[label "Hold" font "Georgia" ink teal] | }'), 'notation');
    assert.ok(paper.publication.pages[0].svg.textContent.includes('Hold'));
  });
});
