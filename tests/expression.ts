// Exercise expressive grammar through VexFlow screen, publication and playback entry points.
import { Annotation, GraceNoteGroup, Ornament, StaveNote, type StemmableNote } from 'vexflow';
import { parseScore, Player, renderConductor, renderEdition, renderScorePart } from '../src/browser';
import { scoreSurfaces } from '../src/playback/geometry';
import { scorePerformance } from '../src/playback/performance';
import { measureVisits } from '../src/playback/visits';
import voice from '../issues/199/voice.vextab';
import rhythm from '../issues/199/rhythm.vextab';
import techniques from '../issues/199/techniques.vextab';
import handy from '../guide/scores/handy-st-louis-blues.vextab';
import joplin from '../guide/scores/joplin-maple-leaf.vextab';
import sor from '../guide/scores/sor-op35-no22.vextab';

/** Native text metrics need a connected surface. */
function host() {
  return document.querySelector('#qunit-fixture').appendChild(document.createElement('div'));
}

QUnit.module('Expressive notation and performance', () => {
  QUnit.test('a harmony diagram has its own strings on a melody note or rest', assert => {
    const spec = '[harmony C "m7", diagram (x 3 1 3 1 3) barre=1/4..2]';
    const score = parseScore('meter 2/4 staff { E4' + spec + ' rest' + spec + ' | }');
    const target = host();
    const view = renderConductor(target, score);
    const page = renderScorePart(host(), score, 'notation').publication.pages[0].svg;
    for (const root of [target, page]) {
      const diagrams = [...root.querySelectorAll('.vf-fret-diagram')];
      assert.equal(diagrams.length, 2);
      for (const diagram of diagrams) {
        assert.equal(diagram.getAttribute('aria-label'), 'Chord frame, low to high: x, 3, 1, 3, 1, 3, barre at fret 1');
        assert.ok(diagram.querySelectorAll('path').length >= 12, 'grid, frets and barre are drawn');
      }
    }
    assert.deepEqual(scorePerformance(view.score, 60).events.flatMap(e => e.notes.map(n => n.pitch)), [64]);
    assert.throws(() => renderConductor(host(), parseScore('meter 1/4 staff { E4' + spec.replace('diagram', 'frame') + ' | }')), /Frame disagrees/);
  });

  QUnit.test('each expanded phrase owns its partial tie, slur and hairpin across a tempo change', assert => {
    const score = parseScore('play { tempo 60 tempo 120 at 1 + 1/8 } '
      + 'pattern start { (C4[tieStart t] E4[sustain 3/16])[slurStart s] } '
      + 'pattern stop { (C4[tieEnd t, sustain 1/8] F4)[crescendoStart h] } '
      + 'pattern pair { use start use stop E4[slurEnd s] G4[hairpinEnd h] | } '
      + 'staff { times 2 { use pair } }');
    const view = renderConductor(host(), score);
    assert.equal(new Set(view.score.ties.map(tie => tie.id)).size, 2);
    const spans = view.composition.sheet.getContinuousLayout().fragments;
    for (const kind of ['tie','slur','crescendo']) assert.equal(spans.filter(s => s.kind === kind).length, 2, kind);
    const notes = scorePerformance(view.score, 60).events.flatMap(e => e.notes.map(n => [e.time, n.pitch, n.duration]));
    assert.deepEqual(notes.filter(n => n[1] === 60 || n[1] === 65), [[0,60,1], [.75,65,.5], [2.25,60,.75], [2.75,65,.5]]);
    assert.deepEqual(notes[1], [0, 64, .625], 'the short head traverses both tempo segments');
    assert.throws(() => parseScore('staff { :8 beam { C4[beamStart b] D4 E4[beamEnd b] } F4 :h G4 | }'), /only one beam/);
  });

  QUnit.test('grace borrows score time and preserves early releases in chord order', assert => {
    function notes(source: string) {
      const view = renderConductor(host(), parseScore(source));
      return scorePerformance(view.score, 60).events.flatMap(e => e.notes.map(n => [e.time, n.pitch, n.duration]));
    }
    const input = 'meter 1/4 staff { :q (C4[sustain 1/16] E4)[grace after steal=1/4 (B4)] | }';
    assert.deepEqual(notes(input), [[0,60,.25], [0,64,.75], [.75,71,.25]]);
    assert.throws(() => parseScore(input.replace('after', 'before')), /consume the entire sounding head/);
    assert.deepEqual(notes('play { tempo 60 tempo 120 at 1 + 1/8 } meter 1/4 staff { :q C4[grace before steal=1/2 (B4)] | }'),
      [[0,71,.5], [.5,60,.25]]);
  });

  QUnit.test('imported crossing endpoints, unequal chord releases and partial ties', assert => {
    const score = parseScore('staff { (C4[tieStart c] E4[sustain 1/8])[slurStart a above] '
      + '(G4 C4[tieEnd c])[crescendoStart b niente] E4[slurEnd a] F4[hairpinEnd b, dynamic f] | }');
    for (const renderer of ['svg', 'canvas'] as const) {
      const view = renderConductor(host(), score, { renderer });
      assert.deepEqual(view.diagnostics, []);
      const spans = view.composition.sheet.getContinuousLayout().fragments;
      assert.deepEqual(spans.map(s => s.kind).sort(), ['crescendo', 'slur', 'tie']);
      const [tie] = view.score.ties;
      assert.deepEqual([tie.fromHead, tie.toHead], [0, 1], 'tie follows the reordered head');
      const notes = scorePerformance(view.score, 60).events.map(e => e.notes);
      assert.deepEqual(notes[0].map(n => [n.pitch, n.duration]), [[60, 2], [64, .5]]);
      assert.deepEqual(notes[1].map(n => n.pitch), [67], 'other head attacks during the tie');
      assert.deepEqual(notes.slice(1).map(chord => chord[0].velocity), [1, 50, 98]);
    }
    const part = renderScorePart(host(), score, 'notation');
    assert.deepEqual(part.diagnostics, []);
    const page = part.publication.pages[0].svg;
    // Publication paints native paths into the physical page. Removing one span removes its ink.
    for (const [start, end] of [['[slurStart a above]', '[slurEnd a]'], ['[crescendoStart b niente]', 'hairpinEnd b, '], ['[tieStart c]', '[tieEnd c]']]) {
      const without = parseScore(score.source.replace(start, '').replace(end, ''));
      const control = renderScorePart(host(), without, 'notation').publication.pages[0].svg;
      assert.ok(page.querySelectorAll('path').length > control.querySelectorAll('path').length, 'printed ' + start);
    }
  });

  QUnit.test('named beam crosses the physical staves in the screen and complete printed piano part', assert => {
    const score = parseScore('meter 2/4 piano { upper treble { :8 G4[beamStart b] F4 E4[onStaff lower] D4[onStaff lower, beamEnd b] | } '
      + 'lower bass { :h C3 | } }');
    function check(notes: StemmableNote[]) {
      assert.equal(notes.length, 4);
      assert.ok(notes.every(n => n.getBeam() === notes[0].getBeam()));
      assert.equal(notes[0].getBeam().getNotes().length, 4);
      assert.deepEqual(notes.map(note => note.getStemDirection()), [-1, -1, 1, 1], 'stems reach toward the shared beam');
      assert.notStrictEqual(notes[0].getStave(), notes[2].getStave(), 'third head is on the opposite hand');
      assert.ok(notes[0].getBeam().getBoundingBox().getW() > 10, 'native beam has ink');
    }
    for (const renderer of ['svg', 'canvas'] as const) {
      const view = renderConductor(host(), score, { renderer });
      assert.deepEqual(view.diagnostics, []);
      check(view.composition.notes[0][0][0] as StemmableNote[]);
    }
    // Publication prepares individual notes before it builds the beam. Inspect the finished page.
    const sheet = renderEdition(host(), score, 'conductor');
    assert.deepEqual(sheet.diagnostics, []);
    const beams = sheet.publication.pages[0].svg.querySelectorAll<SVGGElement>('.vf-beam');
    assert.equal(beams.length, 1, 'one printed beam connects the two staves');
    const stems = [...beams[0].querySelectorAll<SVGPathElement>('.vf-stem path')];
    assert.deepEqual(stems.map(stem => Math.sign(stem.getPointAtLength(0).y - stem.getPointAtLength(stem.getTotalLength()).y)),
      [-1, -1, 1, 1], 'all four printed stems point toward the shared beam');
    assert.ok(beams[0].getBBox().width > 10, 'the printed beam spans the notes');
  });

  QUnit.test('authored grace shares and pedal lift on the written onset', assert => {
    const score = parseScore('piano { upper treble { C4[pedal down] D4 E4[pedal up onset] F4[grace before steal=1/8 (G4)] | } '
      + 'lower bass { :w rest | } }');
    const notes = scorePerformance(renderConductor(host(), score).score, 60).events.flatMap(e => e.notes.map(n => [n.pitch, e.time, n.duration]));
    assert.deepEqual(notes, [[60, 0, 2], [62, 1, 1], [64, 2, 1], [67, 3, .125], [65, 3.125, .875]]);
    assert.throws(() => parseScore('staff { :w C4[slurStart a] | }'), /Missing end/);
    assert.throws(() => parseScore('staff { :q C4[beamStart a] D4[beamEnd a] E4 F4 | }'), /Beam short notes/);
    assert.throws(() => parseScore('staff { :q C4[sustain 1/2] D4 E4 F4 | }'), /sustain exceeds/);
    assert.throws(() => parseScore('staff { :w C4[grace after steal=1/1 (D4)] | }'), /Grace share/);
  });

  QUnit.test('named verses, elision, transposed harmony and a hairpin across a forced break', assert => {
    const score = parseScore(voice);
    for (const renderer of ['svg', 'canvas'] as const) {
      const view = renderConductor(host(), score, { width: 640, renderer });
      const fragments = view.composition.sheet.getContinuousLayout().fragments;
      assert.deepEqual(fragments.filter(f => f.kind === 'crescendo').map(f => !!f.nienteTip), [true, false]);
      const hyphens = fragments.filter(f => f.kind === 'hyphen' && f.part !== 'single');
      assert.deepEqual(hyphens.map(f => f.part), ['first', 'last']);
      const notes = view.navigation.events.map(e => view.composition.getNote(e.id));
      const word = notes[2].getModifiers().find((m): m is Annotation => m instanceof Annotation && m.getText() === 'e');
      assert.equal(hyphens[1].y1, word.computeY().y + word.getYShift(), 'dash lands in the destination verse');
      assert.ok(notes[2].getModifiers().some(m => m instanceof GraceNoteGroup));
      assert.ok(notes[3].getModifiers().some(m => m instanceof Ornament));
      const opening = view.score.measures[0].voices[0].events[0];
      assert.deepEqual(opening.harmony, { root: 'D', quality: 'm7', bass: 'C' });
      assert.equal(opening.verses[1].elideWith, 'on');
      const music = scorePerformance(view.score, 60);
      assert.deepEqual(music.events.map(e => e.notes[0].velocity), [1,33,66,66,66,98,98,98,98]);
      assert.deepEqual(music.events.filter(e => e.source === view.navigation.events[2].source).map(e => e.notes[0].pitch), [64,65,66]);
      assert.equal(music.duration, 4, 'grace group and turn borrow time from their principals');
    }
    const page = renderEdition(host(), score).publication.pages[0].svg;
    assert.ok(page.textContent.includes('Dm7/C'));
    assert.ok(page.textContent.includes('two') && page.textContent.includes('on'));
  });

  QUnit.test('authored beams choose one stem side across the middle line', assert => {
    // Echigo-Jishi opens with four eighths. Its middle-line B alone would receive a down-stem.
    for (const [stem, direction] of [['', 1], ['stem down', -1]] as const) {
      const score = parseScore(`meter 2/4 staff { voice melody ${stem} { :8 beam { A4 A4 B4 A4 } | } }`);
      const view = renderConductor(host(), score, { width: 600 });
      const notes = view.navigation.events.map(event => view.composition.getNote(event.id) as StaveNote);
      assert.deepEqual(notes.map(note => note.getStemDirection()), Array(4).fill(direction));
      assert.ok(notes[0].getBeam() && notes.every(note => note.getBeam() === notes[0].getBeam()));
      const page = renderScorePart(host(), score, 'notation').publication.pages[0].svg;
      const stems = [...page.querySelectorAll<SVGPathElement>('.vf-stem path')];
      assert.deepEqual(stems.map(path => Math.sign(path.getPointAtLength(0).y - path.getPointAtLength(path.getTotalLength()).y)),
        Array(4).fill(direction), 'the printed stems attach on the same side');
    }
  });

  QUnit.test('per-attack stems override the voice in both screen and printed beams', assert => {
    const source = 'meter 2/4 staff { voice melody stem down { :8 beam { C4[stem up] D4[stem up] } '
      + 'E4[stem down] F4[stem down] | :q G4[stem up, tieStart g below] G4[tieEnd g] | } }';
    const score = parseScore(source);
    const directions = [1, 1, -1, -1, 1, -1];
    for (const renderer of ['svg', 'canvas'] as const) {
      const view = renderConductor(host(), score, { renderer });
      const notes = view.navigation.events.map(event => view.composition.getNote(event.id) as StaveNote);
      assert.deepEqual(notes.map(note => note.getStemDirection()), directions);
      assert.equal(view.score.ties[0].side, 'below', 'the tie keeps its own side');
    }
    const page = renderScorePart(host(), score, 'notation').publication.pages[0].svg;
    const stems = [...page.querySelectorAll<SVGPathElement>('.vf-stem path')];
    // Beam paths are emitted separately from unbeamed stems. Put them in reading order.
    stems.sort((a,b) => a.getPointAtLength(0).x - b.getPointAtLength(0).x);
    assert.deepEqual(stems.map(path => Math.sign(path.getPointAtLength(0).y - path.getPointAtLength(path.getTotalLength()).y)), directions);
    assert.throws(() => parseScore('staff { :w C4[stem left] | }'), /stem up or down/);
    assert.throws(() => parseScore('staff { :w C4[stem down, stem up] | }'), /Only one stem/);
  });

  QUnit.test('native beams, divided tremolo time, nested tuplets and a shared piano stem', assert => {
    const target = host(), score = parseScore(rhythm);
    const view = renderConductor(target, score, { width: 600 });
    assert.deepEqual(view.diagnostics, []);
    const upper = view.score.measures[0].voices[0].events;
    const note = (id: string) => view.composition.getNote(view.navigation.events.find(e => e.source === id).id) as StaveNote;
    assert.equal(note(upper[1].id).getBeam().renderOptions.feathered, 'right');
    const [lower] = view.score.measures[0].voices[1].events;
    assert.ok(Math.abs(note(upper[0].id).getStemX() - note(lower.id).getStemX()) <= 1.5);
    assert.equal(target.querySelectorAll('.vf-alternating-tremolo').length, 1);
    assert.deepEqual(view.composition.sheet.getContinuousLayout().fragments.filter(f => f.kind === 'beam').map(f => f.part), ['first','last']);
    const nested = view.score.measures[3].voices[0].events[1];
    assert.equal(note(nested.id).getTupletStack().length, 2);
    assert.equal(nested.duration, '1/18');
    const performance = scorePerformance(view.score, 60);
    const pulses = performance.events.filter(e => e.source === upper[5].id || e.source === upper[6].id);
    assert.deepEqual(pulses.map(e => e.notes[0].pitch), [72,76,72,76,72,76,72,76]);
    assert.ok(pulses.every(e => e.duration === 0.25));
    assert.equal(performance.duration, 16);
    assert.equal(renderEdition(host(), score).publication.pages[0].svg.querySelectorAll('.vf-alternating-tremolo').length, 1);
  });

  QUnit.test('an explicit beam carries its tuplet numeral on the stem side in notation and tab', assert => {
    const score = parseScore('meter 1/4 guitar { tabStems on tabDirection down '
      + 'tuplet 3:2 { :8 beam { 0/6 2/6[hammer] 0/6[pull] } } | '
      + 'tuplet 3:2 { :8 0/6 2/6 0/6 } | '
      + 'tuplet 3:2 { :8 beam { 0/6 2/6 } 0/6 } | }');
    for (const renderer of ['svg', 'canvas'] as const) {
      const { composition, diagnostics } = renderConductor(host(), score, { renderer, width: 520 });
      assert.deepEqual(diagnostics, [], renderer);
      for (const staff of [0, 1]) {
        // The low pitches stem up on the notation staff. The tab rhythms stem down.
        for (const bar of [0, 1]) {
          const notes = composition.notes[bar][staff][0] as StemmableNote[];
          const box = notes[0].getTupletStack()[0].getBoundingBox();
          const beam = notes[0].getBeam().getBoundingBox();
          assert.ok(staff ? box.y >= beam.y + beam.h : box.y + box.h <= beam.y, renderer + ' clears beam ' + bar);
          assert.ok(box.w < notes[2].getAbsoluteX() - notes[0].getAbsoluteX(), 'a full beam needs only the numeral');
        }
        const partial = composition.notes[2][staff][0];
        const box = partial[0].getTupletStack()[0].getBoundingBox();
        assert.ok(box.w >= partial[2].getAbsoluteX() - partial[0].getAbsoluteX(), 'a partial beam keeps its bracket');
      }
    }
  });

  QUnit.test('a held bend releases on one attack; a particular chord head slides and the mapped drum keeps its pitch', assert => {
    const model = parseScore(techniques);
    const view = renderConductor(host(), model);
    const [guitar, drums] = view.parts;
    const bend = scorePerformance(guitar, 96).events;
    assert.equal(bend[0].notes.length, 1);
    assert.equal(bend[1].notes.length, 0);
    assert.deepEqual(bend[0].notes[0].bend, [
      { time: 0.3125, semitones: 2 }, { time: 0.78125, semitones: 2 }, { time: 1.09375, semitones: 0 },
    ]);
    assert.equal(bend[0].notes[0].duration, 1.25);
    assert.equal(bend[2].duration, 60/72);
    assert.deepEqual(bend[2].notes[1].bend, [{time: bend[3].time - bend[2].time, semitones: 3}]);
    assert.strictEqual(bend[2].notes[0].bend, undefined, 'only the named head slides');
    const gliss = guitar.spans.find(s => s.kind === 'glissando');
    assert.ok(gliss && 'fromHead' in gliss && gliss.fromHead === 1 && gliss.toHead === 1);
    assert.ok(view.composition.sheet.getContinuousLayout().fragments.some(f => f.bend));
    const hits = scorePerformance(drums, 96).events.flatMap(e => e.notes);
    assert.deepEqual(hits.map(n => [n.program, n.pitch, n.velocity]), [[118,53,52],[118,53,112]]);
    const part = renderScorePart(host(), model, 'notation', { partId: 'percussion' });
    assert.deepEqual(part.diagnostics, []);
    assert.equal(part.score.measures[0].voices[0].events[0].heads[0].drum, 'bell');
    const bell = view.navigation.events.find(e => e.label.includes('Ride bell'));
    assert.ok((view.composition.getNote(bell.id) as StaveNote).getKeys()[0].endsWith('/TU'));
    const printed = part.publication.pages[0].svg;
    assert.ok(printed.querySelector('.vf-notehead text'));
    assert.equal(scoreSurfaces.get(printed).read().get(bell.source).heads.length, 1, 'printed bell is a sounding cursor target');
    assert.ok(printed.querySelector('metadata').textContent.includes('Ride bell'));
  });

  QUnit.test('the source passages retain their independent written voices and performed attacks', assert => {
    const model = parseScore(joplin), view = renderConductor(host(), model, { width: 920 });
    const visits = measureVisits(view.score, true);
    const range = (first: number, last: number) => Array.from({length: last-first+1}, (_,i) => i+first);
    assert.deepEqual(visits, [1,...range(2,17),...range(2,16),18]);
    assert.equal(scorePerformance(view.score, 90, undefined, visits).events.flatMap(e => e.notes).length, 552);
    const crossing = view.navigation.events.find(e => view.score.measures[e.measure-1].voices[0].events.some(a => a.id === e.source && a.displayHand === 'left'));
    assert.strictEqual(view.composition.getNote(crossing.id).getStave(), view.composition.staves[crossing.measure-1][1]);
    assert.deepEqual(renderScorePart(host(), model, 'right').diagnostics, []);
    const singer = renderScorePart(host(), parseScore(handy), 'notation', {partId:'singer'});
    const words = singer.score.measures.flatMap(m => m.voices[0].events.flatMap(e => e.verses ?? []));
    assert.equal(singer.score.measures.length, 12);
    for (const verse of ['first','second']) {
      const line = words.filter(w => w.verse === verse).map(w => w.text).join(' ');
      assert.ok(line.startsWith(verse === 'first' ? 'I hate to see' : 'Been to de Gyp sy'));
      assert.ok(line.endsWith(verse === 'first' ? 'dis town' : 'ly Roll'));
    }
    const study = renderConductor(host(), parseScore(sor)).score;
    const attacks = scorePerformance(study, 60).events;
    assert.equal(attacks.find(e => e.source === study.measures[0].voices[0].events[0].id).notes[0].duration, 2);
    assert.ok(attacks.some(e => e.time === 0.5 && e.notes.length), 'accompaniment moves under the held melody');
    assert.equal(attacks.find(e => e.source === study.measures[0].voices[2].events[0].id).notes[0].duration, 6, 'bass continues into the next bar');
  });

  QUnit.test('Joplin bar 8 moves the complete upper voice to the bass staff with separate beams and rests', assert => {
    const model = parseScore(joplin);
    for (const renderer of ['svg','canvas'] as const) {
      const view = renderConductor(host(), model, {width:920, renderer});
      const bar = view.score.measures[7];
      const glyphs = bar.voices.map(v => v.events.map(event => {
        const id = view.navigation.events.find(e => e.source === event.id).id;
        return view.composition.getNote(id) as StaveNote;
      }));
      const [upper, lower] = glyphs;
      assert.ok(upper.every(n => n.getStave() === view.composition.staves[7][1] && n.getStemDirection() === 1));
      assert.ok(lower.every(n => n.getStemDirection() === -1 && !n.getBeam()));
      assert.deepEqual(upper.map(n => n.getBeam()?.getNotes().length ?? 0), [0,3,3,3,0,3,3,3]);
      assert.notStrictEqual(upper[1].getBeam(),upper[5].getBeam());
      const dynamic = upper[0].getModifiers().find((m): m is Annotation => m instanceof Annotation);
      assert.ok(dynamic.computeY().y < upper[0].getStave().getYForLine(0), 'p clears the shared bass staff');
    }
    const printed: StaveNote[] = [];
    renderScorePart(host(), model, 'notation', {noteHooks:[(opts,note) => {
      if (opts.id.endsWith('keys.upper.main.43') || opts.id.endsWith('keys.lower.main.24')) printed.push(note as StaveNote);
    }]});
    assert.equal(printed.length,2);
    assert.strictEqual(printed[0].getStave(),printed[1].getStave(), 'the upper rest also crosses in print');
  });

  QUnit.test('all five signs engrave and resolve in key, including the inverted glyphs and an after-grace', assert => {
    const source = 'meter 1/4 staff { key G E4[ornament tr] | E4[ornament mordent] | E4[ornament mordent_inverted] | '
      + 'E4[ornament turn] | E4[ornament turn_inverted] | E4[grace after (F4)] | }';
    const score = parseScore(source), view = renderConductor(host(), score);
    assert.deepEqual(renderEdition(host(), score).diagnostics, []);
    const music = scorePerformance(view.score, 60);
    const expected = [[64,66,64,66,64],[64,66,64],[64,62,64],[66,64,62,64],[62,64,66,64],[64,66]];
    for (const [i, event] of view.navigation.events.entries()) {
      const attacks = music.events.filter(e => e.source === event.source);
      assert.deepEqual(attacks.map(e => e.notes[0].pitch), expected[i]);
      assert.equal(attacks[0].time, i);
      assert.equal(attacks.reduce((n,e) => n + e.duration, 0), 1);
    }
  });

  QUnit.test('a tremolo spanning the middle line keeps parallel stems in its own score and its cue', assert => {
    const source = 'meter 1/4 edition part listener { cue solo at 1 "Solo" } '
      + 'staff solo { tremolo 2 { :q C4 C6 } | } staff listener { :q rest | }';
    const score = parseScore(source);
    const view = renderConductor(host(), score);
    const pair = view.navigation.events.filter(e => e.staff === 'solo.main').map(e => view.composition.getNote(e.id) as StaveNote);
    assert.equal(pair[0].getStemDirection(), pair[1].getStemDirection());
    const page = renderEdition(host(), score, {partId:'listener'}).publication.pages[0].svg;
    assert.ok(page.querySelector('[data-region="cue"] .vf-alternating-tremolo'));
  });

  QUnit.test('repeat barlines and invalid expressive commands preserve their written locations', assert => {
    const full = renderConductor(host(), parseScore('meter 1/4 staff { C4 | repeatStart D4 | E4 bar repeatEnd F4 | }'));
    assert.deepEqual(measureVisits(full.score, false), [1,2,3,4]);
    assert.deepEqual(measureVisits(full.score, true), [1,2,3,2,3,4]);
    for (const [source, reason] of [
      ['meter 1/4 staff { C4[verse one "a", verse one "b"] | }', /Only one verse/],
      ['meter 1/4 staff { C4[gliss 2] | }', /glissando head/],
      ['meter 1/4 guitar { 0/1[release hold=1/4 release=3/4] | }', /tied continuation/],
      ['meter 1/4 staff { rest[grace before (C4)] | }', /pitched notation anchor/],
      ['play { tempo 80 at 3 } meter 1/4 staff { C4 | }', /Tempo change lies beyond/],
    ] as const) {
      assert.throws(() => renderConductor(host(), parseScore(source)), reason);
    }
  });

  QUnit.test('the public player routes programs and revisits source IDs without sounding cues or TAB twice', async assert => {
    const model = parseScore('meter 1/4 edition part g { cue lead at 2 "Lead" } '
      + 'staff lead { program 40 volta 2 { :q C4 | } ending 1 { D4 | } ending 2 { E4 | } } '
      + 'guitar g { program 26 view both :q 0/1 | rest | 2/1 | }');
    const cue = renderEdition(host(), model, {partId:'g'}).publication.pages[0].svg;
    assert.ok(cue.querySelector('[data-region="cue"]'));
    for (const order of ['written','performed'] as const) {
      const played = new Map<number, number[]>(), stopped: number[] = [];
      const player = new Player(model, { order, tempo: 600, playback: { open(program) {
        played.set(program, []);
        return { playNote(n) { played.get(program).push(n.pitch); }, stop() { stopped.push(program); } };
      } } });
      try { await player.play(); } finally { player.dispose(); }
      assert.deepEqual(played.get(40), order === 'written' ? [60,62,64] : [60,62,60,64]);
      assert.deepEqual(played.get(26), order === 'written' ? [64,66] : [64,64,66]);
      assert.deepEqual(stopped.sort(), [26,40]);
    }
  });
});
