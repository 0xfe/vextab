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
  QUnit.test('named verses, elision, transposed harmony and a hairpin across a forced break', assert => {
    const score = parseScore(voice);
    for (const renderer of ['svg', 'canvas'] as const) {
      const view = renderConductor(host(), score, { width: 640, renderer });
      const fragments = view.composition.sheet.getContinuousLayout().fragments;
      assert.deepEqual(fragments.filter(f => f.kind === 'crescendo').map(f => !!f.nienteTip), [true, false]);
      const hyphens = fragments.filter(f => f.kind === 'hyphen');
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
