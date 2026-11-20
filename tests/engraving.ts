// Musical regressions for the fixed-row renderer and public editor.
import { readScore } from './read-score';
import Artist from '../src/artist';
import { renderScore, renderScorePart } from '../src/score/layout';
import { parseScore, ScoreError } from '../src/score/parse';
import { Annotation, FretHandFinger, StaveNote, TabNote } from 'vexflow';
import Div from '../src/div';
import Vex from '../src/vexflow';
import VexTab from '../src/vextab';

const { Renderer, Barline, Accidental } = Vex.Flow;

/** Render through the same public entry points used by browser embeds. */
function legacy(source: string) {
  const host = document.createElement('div');
  document.querySelector('#qunit-fixture').append(host);
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  const artist = new Artist(10, 10, 600);
  const parser = new VexTab(artist, { language: 1 });
  parser.parse(source);
  artist.draw(renderer);
  return { artist, parser, host, renderer, group: artist.staves[0] };
}

/** Render the tested instrument through the v2 path used by current browser examples. */
function notation(source: string) {
  const host = document.querySelector('#qunit-fixture').appendChild(document.createElement('div'));
  const view = renderScore(host, readScore(source), { width: 640 });
  return { host, ...view };
}

/** Compare visible SVG shapes and text without counting generated element IDs. */
function ink(host: HTMLElement) {
  return Array.from(host.querySelectorAll('text,path,rect')).map(el =>
    [el.textContent, ...['x', 'y', 'd', 'width', 'height', 'transform'].map(a => el.getAttribute(a))]);
}

QUnit.module('Engraving', () => {
  QUnit.test('Compact fingering and accent spellings engrave the original hammer-on identically', assert => {
    const long = legacy('tabstave notation=true\nnotes :8 6/4 $.fingering/1:l:f:2.$ h7/4 $.fingering/1:l:f:3.$ :q 0/2 $.fingering/1:r:f:3.$ $.a>/top.$');
    const compact = legacy('tabstave notation=true fingering=left accents=top\nnotes :8 6/4[f2] h7/4[f3] :q 0/2[f3:r, >]');
    assert.deepEqual(ink(compact.host), ink(long.host), 'same glyph positions, shapes and sizes');

    const chord = notation('meter 1/4 staff { (G4[finger 4 right] C4[finger 1]) | }');
    const fingerings = chord.composition.notes[0][0][0][0].getModifiers().filter(m => m instanceof FretHandFinger);
    assert.deepEqual(fingerings.map(m => [m.getIndex(), m.getFretHandFinger()]), [[0, '4'], [1, '1']]);
    const beamed = notation('meter 1/4 staff { beam { :8 C4[finger 1] D4[finger 2] } | }');
    assert.ok((beamed.composition.notes[0][0][0][0] as StaveNote).getBeam(), 'beam brackets can enclose marked notes');
  });

  QUnit.test('Responsive marks respect stave, voice and per-head placement and preserve source selection', assert => {
    const source = 'meter 1/4 staff { voice melody { (C4[finger 1 right] G4[finger 5, accent below]) | } '
      + 'voice bass stem down { C3[finger 2 right, accent] | } }';
    const parsed = readScore(source);
    const voices = parsed.measures[0].voices;
    const chord = voices[0].events[0];
    assert.deepEqual(chord.heads.map(h => h.marks), [[{finger:'1',stringNumber:false,position:'right'}],
      [{finger:'5',stringNumber:false,position:'left'}, {articulation:'a>',position:'below'}]]);
    assert.equal(source.slice(chord.heads[1].range.start, chord.heads[1].range.end), 'G4');
    assert.deepEqual(voices[1].events[0].heads[0].marks, [{finger:'2',stringNumber:false,position:'right'}, {position:'above'}]);
    const host = document.createElement('div');
    document.querySelector('#qunit-fixture').append(host);
    const view = renderScore(host, parsed, { width: 440 });
    assert.ok(host.querySelector('svg path'));
    const note = view.composition.getNote(view.navigation.events[0].id);
    assert.equal(note.getModifiers().filter(m => m instanceof FretHandFinger).length, 2);
    assert.equal(note.getModifiers().filter(m => m instanceof Vex.Flow.Articulation).length, 1);
    for (const invalid of ['[finger 7]', '[finger 1 near]', '[accent left]', '[finger 2,]']) {
      assert.throws(() => readScore('meter 1/4 staff {\r\n C4' + invalid + ' | }'), e => e.line === 2 && e.column > 3);
    }
    const overridden = readScore(source.replace('finger 2 right', 'finger 2 above'));
    assert.equal(overridden.measures[0].voices[1].events[0].heads[0].marks[0].position, 'above');
  });

  QUnit.test('Printed piano fingerings keep chord heads, dotted rhythm, ties and source IDs', assert => {
    const source = 'meter 3/4 staff { :q. (G4[finger 5 right] C4[finger 1]) :8 D4[finger 2, accent] :q G4 | G4[tie, finger 4] :h A4 | }';
    const parsed = readScore(source);
    const host = document.createElement('div');
    document.querySelector('#qunit-fixture').append(host);
    const seen: StaveNote[] = [];
    const { publication, sourceFor } = renderScorePart(host, parsed, 'notation', {
      noteHooks: [(_options, note) => { if (note instanceof StaveNote) seen.push(note); }],
    });
    const chord = seen.find(note => note.getKeys().length === 2);
    assert.deepEqual(chord.getModifiers().filter(m => m instanceof FretHandFinger).map(m => [m.getIndex(), m.getFretHandFinger()]), [[0, '5'], [1, '1']]);
    assert.equal(sourceFor(chord.getAttribute('id')), parsed.measures[0].voices[0].events[0].id);
    assert.equal(chord.getTicks().value(), 6144, 'dotted quarter retained');
    const svg = publication.pages[0].svg;
    assert.ok([...svg.querySelectorAll('text')].some(text => text.textContent === '5'), 'the exported SVG contains the fingering');
    assert.ok(JSON.parse(svg.querySelector('metadata').textContent).spans.some(s => s.kind === 'tie'), 'tie survives re-composition');
    const tab = readScore('meter 1/4 guitar { view tab 3/4[accent] | }');
    assert.throws(() => renderScorePart(host, tab, 'tab'), /fretted or special head/);
  });

  QUnit.test('A pre-bent fret sounds at the raised pitch for one written attack', assert => {
    const source = 'tabstave notation=true time=2/4\nnotes :q (5/2.7z8z7/3) 7z9/3';
    const { group, host, parser } = legacy(source);
    const tab = group.tab_voices[0];
    assert.equal(tab.length, 2);
    assert.deepEqual(tab[0].getPositions().map(p => p.fret), ['5', '7']);
    const bends = tab[0].getModifiers().filter(m => m instanceof Vex.Flow.Bend);
    assert.deepEqual(bends.map(m => m.getIndex()), [1]);
    assert.deepEqual(tab[0].getPlayNote().map(s => s.toLowerCase()), ['e/5', 'd#/5']);
    assert.ok([...host.querySelectorAll('text')].some(t => t.textContent === '½'));
    assert.throws(() => parser.parse(source.replace('7z8z7', '7z7')), /above the fretted pitch/);
    assert.throws(() => parser.parse(source.replace('7z8z7', '7z8z6')), /original fret/);
    const fretted = notation('meter 2/4 guitar { (5/2 7/3[prebend +1 release]) 7/3[prebend +2] | }');
    const chord = fretted.score.measures[0].voices[0].events[0];
    assert.deepEqual(chord.heads.map(h => h.position.fret), [5, 7]);
    assert.deepEqual(chord.heads.map(h => h.sounding), ['e/4', 'd#/4']);
    assert.equal(chord.heads[1].prebend.release, true);
    const onlyStaff = notation('meter 1/4 guitar { view notation 7/3[prebend +1 release] | }');
    assert.ok(onlyStaff.navigation.events[0].label.includes('Pre-bend ½ on string 3, release'));
  });

  QUnit.test('SVG embeds clear every fret with opaque paper', assert => {
    const fixture = document.querySelector('#qunit-fixture');
    const style = document.createElement('style');
    style.textContent = '.fret-paper .vex-canvas { background-color: var(--paper); }';
    fixture.append(style);

    for (const [paper, expected] of [
      ['', 'rgb(255, 255, 255)'],
      ['rgba(20, 40, 60, 0)', 'rgb(255, 255, 255)'],
      ['color(srgb 0.2 0.3 0.4 / 0.5)', 'rgb(255, 255, 255)'],
      ['#fff4d6', 'rgb(255, 244, 214)'],
    ]) {
      const host = document.createElement('div');
      if (paper) {
        host.className = 'fret-paper';
        host.style.setProperty('--paper', paper);
      }
      host.setAttribute('language', '2');
      host.textContent = 'guitar { view tab 0/1 12/1 (10/2 12/3) 4/1 | }';
      fixture.append(host);
      const editor = new Div(host);
      const frets = host.querySelectorAll('.vf-tabnote text');
      const fills = Array.from(frets, fret => getComputedStyle(fret.previousElementSibling).fill);
      assert.deepEqual(fills, Array(5).fill(expected), paper || 'unstyled embed');
      editor.dispose();
    }
  });

  QUnit.test('Fixed, flow and print keep the native fret size and clear the strings', assert => {
    const source = 'tabstave time=4/4\nnotes :q 0/1 3/2 (12/2.10/3) 15/4 |';
    const { host } = legacy(source);
    const parsed = readScore('meter 4/4 guitar { view tab 0/1 3/2 (12/2 10/3) 15/4 | }');
    // Use the installed VexFlow face and size, including when its defaults change upstream.
    function checkFrets(layout: string) {
      const frets = [...host.querySelectorAll<SVGTextElement>('.vf-tabnote text')];
      assert.deepEqual(frets.map(el => el.textContent), ['0', '3', '12', '10', '15'], layout);
      const bounds = frets.map(el => {
        const native = Vex.Flow.TabNote.tabToElement(el.textContent);
        const metrics = native.getTextMetrics();
        const x = el.x.baseVal.getItem(0).value;
        const y = el.y.baseVal.getItem(0).value;
        const gap = (el.previousElementSibling as SVGRectElement).getBBox();
        assert.equal(native.fontSizeInPoints, 11, layout + ' upstream fret size');
        assert.closeTo(parseFloat(getComputedStyle(el).fontSize), native.fontSizeInPixels, 0.01, layout);
        assert.ok(x - metrics.actualBoundingBoxLeft >= gap.x + 1, layout + ' left gap');
        assert.ok(x + metrics.actualBoundingBoxRight <= gap.x + gap.width - 1, layout + ' right gap');
        return { top: y - metrics.actualBoundingBoxAscent, bottom: y + metrics.actualBoundingBoxDescent };
      });
      assert.ok(bounds[3].top - bounds[2].bottom >= 2, layout + ' stacked two-digit frets');
    }
    checkFrets('fixed');
    renderScore(host, parsed, { width: 240, part: 'tab' });
    checkFrets('flow');
    renderScorePart(host, parsed, 'tab', { paper: 'Letter' });
    checkFrets('Letter part');
  });

  QUnit.test('Both renderers join filled and hollow rhythm slashes at their Bravura anchors', assert => {
    for (const direction of ['top', 'bottom']) {
      const source = 'stave time=4/4 voice=' + direction + '\nnotes :qSd B/4 :8S B/4 :hS B/4';
      const fixed = legacy(source);
      const flow = renderScore(fixed.host, readScore('meter 4/4 staff { stem ' + (direction === 'top' ? 'up' : 'down') + ' :q. B4[slash] :8 B4[slash] :h B4[slash] | }'));
      for (const notes of [fixed.group.note_notes, flow.composition.notes[0][0][0]]) {
        for (const [i, note] of (notes as StaveNote[]).entries()) {
          const up = direction === 'top';
          const space = note.noteHeads[0].fontSizeInPixels / 4;
          const anchorY = i === 2 ? 1 : up ? 0.656 : 0.664;
          const segment = note.getStemSegment();
          assert.closeTo(segment.baseY, note.getYs()[0] + (up ? -1 : 1) * anchorY * space, 0.02);
          const anchorX = up ? (i === 2 ? 3.12 : 1.46) * space : 0;
          assert.closeTo(segment.x, note.getNoteHeadBeginX() + anchorX + (up ? -1 : 1) * Vex.Flow.Stem.WIDTH / 2, 0.02);
        }
      }
    }
  });

  QUnit.test('Annotations default to Academico and respect an authored face', assert => {
    const view = notation('meter 3/4 staff { C4[label "Am"] D4[label "hold" style italic] E4[label "F" font "Times" style bold] | }');
    const fonts = view.composition.notes[0][0][0].map(note => (note.getModifiers().find(m => m instanceof Annotation) as Annotation).fontInfo.family);
    assert.deepEqual(fonts, ['Academico','Academico','Times']);
  });

  QUnit.test('A quoted option sets a multi-word font on the rendered label', assert => {
    const options = 'options font-face="Times New Roman" font-style=bold';
    const { host, parser } = legacy(options + '\nstave\nnotes :q C/4 $Am$');
    const label = [...host.querySelectorAll('svg text')].find(el => el.textContent === 'Am');
    assert.equal(label.getAttribute('font-family'), 'Times New Roman');
    assert.equal(label.getAttribute('font-weight'), 'bold');
    assert.throws(() => parser.parse('options font-face="Times\nstave'), /Unexpected text/);
    // The flow editor selects the complete option when it directs the author to fixed layout.
    const flowSource = 'options beams=auto font-face="Times New Roman"\nstave';
    assert.throws(() => parseScore(flowSource, { language: 1 }), error => error instanceof ScoreError &&
      error.code === 'fixed-layout' && flowSource.slice(error.range.start, error.range.end) === 'font-face="Times New Roman"');
  });

  QUnit.test('Tab stems are opt-in for both paired and standalone tablature', assert => {
    for (const display of ['both', 'tab']) {
      for (const setting of ['', 'tabStems off', 'tabStems on']) {
        const source = `guitar { view ${display} ${setting} meter 2/4 :8 0-2-3-2/1 | }`;
        const view = notation(source);
        const staves = view.composition.notes[0];
        const tab = staves[staves.length - 1][0] as TabNote[];
        const enabled = setting === 'tabStems on';
        assert.deepEqual(tab.map(note => note.hasStem()), Array(4).fill(enabled));
        assert.deepEqual(tab.map(note => note.getTicks().value()), Array(4).fill(2048));
        assert.equal(Boolean(tab[0].getBeam()), enabled);
        if (display === 'both') {
          const staff = staves[0][0] as StaveNote[];
          assert.true(staff.every(note => note.hasStem()));
          assert.ok(staff[0].getBeam());
        }
        const print = document.createElement('div');
        renderScorePart(print, parseScore(source), 'tab');
        assert.equal(print.querySelectorAll('.vf-stem path').length > 0, enabled, 'printed tab stems');
      }
    }
    const duet = notation('guitar { tabStems on voice a tabStems off { :h 0/1 1/1 | } voice b { :h 2/2 3/2 | } }');
    assert.deepEqual(duet.composition.notes[0][1].map(notes => (notes[0] as TabNote).hasStem()), [false, true]);
  });

  QUnit.test('A tuplet keeps exact time in every projection, including a silent rest', assert => {
    for (const staff of ['notation', 'tab', 'both']) {
      for (const stems of ['on', 'off']) {
        const view = notation('meter 1/4 guitar { view ' + staff + ' tabStems ' + stems + ' tuplet 3:2 { :8 1/2 rest 3/2 } | }');
        for (const [notes] of view.composition.notes[0])
          assert.deepEqual(notes.map(n => n.getTicks().clone().simplify().toString()), Array(3).fill('4096/3'));
      }
    }
    // The fixed Artist draws separate native tuplet objects for the two projections.
    const paired = legacy('options tab-stems=true\ntabstave notation=true\nnotes :8 1-2-3/1 ^3^');
    const upper = paired.artist.stave_articulations[0].getBoundingBox();
    const lower = paired.artist.tab_articulations[0].getBoundingBox();
    assert.true(upper.y + upper.h < lower.y - 2, 'Both triplet numbers clear each other');
    const tabOnly = legacy('options tab-stems=true\ntabstave\nnotes :8 1-2-3/1 ^3^');
    assert.true(tabOnly.artist.tab_articulations[0].getBoundingBox().y >= 10, 'The tab numeral clears the top edge');
    const dotted = notation('guitar { tabStems on fragment { tuplet 2:3 { :8 1/1 2/1 } :q.. 3/1[slash] } }');
    for (const [notes] of dotted.composition.notes[0]) {
      assert.deepEqual(notes.map(n => n.getTicks().value()), [3072, 3072, 7168]);
      assert.equal(notes[2].getModifiers().filter(m => m.getCategory() === 'Dot').length, 2);
    }
  });

  QUnit.test('6/8 groups, explicit beams and independent voice stems', assert => {
    const first = notation('meter 6/8 staff { display meter hidden groupBeats (3 3) :8 C4 D4 E4 F4 G4 A4 | }');
    const ns = first.composition.notes[0][0][0] as StaveNote[];
    assert.equal(first.composition.voices[0][0][0].getTotalTicks().value(), 12288);
    assert.deepEqual(ns[0].getBeam().getNotes(), ns.slice(0, 3));
    assert.deepEqual(ns[3].getBeam().getNotes(), ns.slice(3));
    assert.false(first.composition.staves[0][0].getModifiers().some(m => m.getCategory() === 'TimeSignature'));
    const duet = notation('meter 3/4 staff { voice low stem down { beam { :8 C4 :8. D4 } :8. E4 :q F4 | } '
      + 'voice high stem up beams off { :8 G4 A4 :q B4 rest | } }');
    const [lower, upper] = duet.composition.notes[0][0] as StaveNote[][];
    assert.deepEqual(lower[0].getBeam().getNotes(), lower.slice(0, 2));
    assert.notOk(lower[2].getBeam());
    assert.equal(lower[3].getStemDirection(), -1);
    assert.equal(upper[2].getStemDirection(), 1);
    assert.notOk(upper[0].getBeam());
    for (const enabled of ['on', 'off']) {
      const rests = notation('meter 2/4 staff { groupBeats (2) stemlets on beamRests ' + enabled + ' :8 C4 rest D4 E4 | }');
      const rest = rests.composition.notes[0][0][0][1] as StaveNote;
      assert.equal(!!rest.getBeam(), enabled === 'on');
      if (rest.getBeam()) assert.true(rest.getBeam().renderOptions.showStemlets);
    }
  });

  QUnit.test('Slash chord changes keep their beat across a bar and an explicit text bar', assert => {
    for (const spacer of ['', '|,']) {
      const { group } = legacy('stave\ntext :qd,G/A,:h,C/A,:8, ,:w,' + spacer + 'Fmaj7\nnotes :qSd X/5 :8S X/5 :hS sX/5 | :w X/5');
      const notes = group.note_notes.filter(n => !n.shouldIgnoreTicks());
      const labels = group.text_voices[0].filter(n => !n.shouldIgnoreTicks());
      for (const i of [0, 1, 3]) assert.equal(labels[i].getAbsoluteX(), notes[i].getAbsoluteX());
      assert.equal(notes[0].getTicks().value(), 6144);
    }
    const measured = notation('staff { :q. slash :8 slash :h slash | :w slash | '
      + 'text harmony { :q. "G/A" :h "C/A" :8 skip | :w "Fmaj7" | } }');
    const [[rhythm, labels]] = measured.composition.notes[0];
    assert.equal(rhythm[0].getAbsoluteX(), labels[0].getAbsoluteX());
    assert.equal(rhythm[1].getAbsoluteX(), labels[1].getAbsoluteX());
    const [[nextRhythm, nextLabels]] = measured.composition.notes[1];
    assert.equal(nextRhythm[0].getAbsoluteX(), nextLabels[0].getAbsoluteX());
  });

  QUnit.test('Upper tab annotations stay above the staff and preserve fret numbers', assert => {
    const view = notation('guitar { view tab 4/3[label "A" above] 5/3[label "B" above] 6/3[label "C" above] 10/1 | '
      + '5/3[stroke down, label "A" above] 4/3[stroke up, label "B" above] x/3[stroke down, label "C" above] 2/2 | }');
    const notes = view.composition.notes.flatMap(measure => measure[0][0]) as TabNote[];
    const marks = notes.flatMap(n => n.getModifiers()).filter(m => m instanceof Annotation);
    assert.deepEqual(marks.map(m => m.getText()), ['A', 'B', 'C', 'A', 'B', 'C']);
    assert.equal(new Set(marks.map(m => m.computeY().y)).size, 1);
    assert.true(marks[0].computeY().y < view.composition.staves[0][0].getYForLine(0));
    assert.equal(notes[1].getPositions()[0].fret, 5);
  });

  QUnit.test('Rests use staff coordinates on four strings and ledger glyphs outside five lines', assert => {
    const view = notation('guitar { tuning (G5 D5 A4 E4) tabStems on :h rest[line 1.5] rest[line 0] | :w rest[line 6] | }');
    const [staff, tab] = view.composition.notes[0].map(([notes]) => notes as StaveNote[]);
    assert.equal(staff[0].getYs()[0], view.composition.staves[0][0].getYForLine(3.5));
    assert.equal(tab[0].getYs()[0], view.composition.staves[0][1].getYForLine(2.5));
    assert.equal(staff[1].noteHeads[0].getText(), '\uE4F5');
    assert.equal((view.composition.notes[1][0][0][0] as StaveNote).noteHeads[0].getText(), '\uE4F4');
  });

  QUnit.test('Chord permutations retain accidental glyph and fingering ownership', assert => {
    for (const chord of ['G5 C5 Eb4[finger 2 right] B4', 'Eb4[finger 2 right] B4 C5 G5']) {
      const { composition, host } = notation('meter 1/4 staff { key F (' + chord + ') | }');
      const note = composition.notes[0][0][0][0] as StaveNote;
      const flat = note.getModifiers().find(m => m instanceof Accidental);
      assert.equal(note.getKeys()[flat.getIndex()].toLowerCase(), 'eb/4');
      const finger = note.getModifiers().find(m => m.getCategory() === 'FretHandFinger');
      assert.equal(finger.getIndex(), flat.getIndex());
      const glyph = Array.from(host.querySelectorAll('text')).find(el =>
        el.textContent === '\uE260' && Math.abs(Number(el.getAttribute('y')) - note.getYs()[flat.getIndex()]) < 0.01);
      assert.ok(glyph, 'A flat is actually drawn at E4');
    }
  });

  QUnit.test('Accidentals follow written octave, bar and musical time across voices', assert => {
    const signs = n => n.getModifiers().filter(m => m instanceof Accidental).map(m => [m.type, m.isCautionary()]);
    // Both open G strings in this tuning cancel the signature, in separate octaves.
    const octave = notation('guitar { key A tuning (G5 G4 D4 A3 E3 B2) view notation fragment { 0/1 0/2 0/1 | 0/1 } }');
    assert.deepEqual(octave.composition.notes.flatMap(measure => measure[0][0]).map(signs),
      [[['n', false]], [['n', false]], [], [['n', false]]]);
    // A physical open G cancels the signature regardless of the order of the two voices.
    for (const voices of [['rest 0/3', '0/3 rest'], ['0/3 rest', 'rest 0/3']]) {
      const view = notation('meter 2/4 guitar { key A view notation voice a { ' + voices[0] + ' | } voice b { ' + voices[1] + ' | } }');
      const sorted = (view.composition.notes[0][0] as StaveNote[][]).flatMap(ns => ns.map((n,i) => ({n, i})))
        .filter(e => !e.n.isRest()).sort((a,b) => a.i - b.i);
      assert.deepEqual(sorted.map(e => signs(e.n)), [[['n', false]], []]);
    }
    const courtesy = notation('meter 1/4 staff { key F Bb4[courtesy] | }');
    assert.deepEqual(signs(courtesy.composition.notes[0][0][0][0]), [['b', true]]);
  });

  QUnit.test('Exact spellings and forced signs preserve pitches, glyphs and individual selections', assert => {
    const source = 'meter 4/4 staff { key D Fn4[showSign] Fn4 F#4[showSign] F#4 | }';
    const view = notation(source);
    const events = view.score.measures[0].voices[0].events;
    assert.deepEqual(events.map(e => e.heads[0].sounding), ['f/4', 'f/4', 'f#/4', 'f#/4']);
    assert.deepEqual(events.map(e => source.slice(e.range.start, e.range.end)), ['Fn4[showSign]', 'Fn4', 'F#4[showSign]', 'F#4']);
    const modifiers = notes => notes.map(n => n.getModifiers().filter(m => m instanceof Accidental).map(m => m.type));
    assert.deepEqual(modifiers(view.composition.notes[0][0][0]), [['n'], [], ['#'], []]);
    const automatic = notation('meter 4/4 staff { key D Fn4 Fn4 F#4 F#4 | }');
    assert.deepEqual(modifiers(automatic.composition.notes[0][0][0]), [['n'], [], ['#'], []]);
    const old = legacy('stave key=D time=4/4\nnotes Fn-F-F#-F/4 |');
    assert.deepEqual(modifiers(old.group.note_notes.filter(n => !n.shouldIgnoreTicks())), [['n'], [], ['#'], []]);
  });

  QUnit.test('Reordered ties cross the bar after a triplet and stay on the written head', assert => {
    for (const [instrument, phrase, a, b] of [
      ['guitar', '1/2 2/2 3/2', '1/2', '0/3'], ['staff', 'C4 D4 E4', 'C4', 'E4'],
    ]) {
      const chord = '(' + a + ' ' + b + ')';
      const source = instrument + ' { fragment { tuplet 3:2 { :8 ' + phrase + ' } :q ' + chord
        + ' (' + a + '[tie] ' + b + '[tie]) | (' + b + '[tie] ' + a + '[tie]) } }';
      const screen = notation(source);
      const [before, after] = screen.score.measures;
      const links = screen.score.ties.filter(t => t.to === after.voices[0].events[0].id);
      assert.deepEqual(links.map(t => [t.from, t.fromHead, t.toHead]), [[before.voices[0].events[4].id, 1, 0], [before.voices[0].events[4].id, 0, 1]]);
      for (const link of links) {
        const region = screen.navigation.regions.find(r => r.source === link.id);
        assert.ok(region && region.w > 0, 'tie has drawn width at its head');
      }
    }
  });

  QUnit.test('Repeated draws, width, backend and a second Artist preserve the score', assert => {
    const { artist, group, renderer, host } = legacy('options tab-stems=true\ntabstave notation=true\nnotes =|: :8 1-2-3/1 ^3^ =:: 4/1 =:|');
    const other = legacy('stave\nnotes :q C/4');
    const previous = ink(host);
    const otherInk = ink(other.host);
    artist.draw(renderer);
    assert.deepEqual(ink(host), previous);
    const bar = Barline.type;
    for (const [stave, notes] of [[group.note, group.note_notes], [group.tab, group.tab_notes]]) {
      assert.equal(stave.getModifiers()[0].getType(), bar.NONE);
      assert.equal(notes[0].getType(), bar.REPEAT_BEGIN);
      assert.equal(notes[4].getType(), bar.REPEAT_BOTH);
      assert.equal(stave.getModifiers()[1].getType(), bar.REPEAT_END);
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const labels: string[] = [];
    const drawText = ctx.fillText.bind(ctx);
    ctx.fillText = (label, x, y) => { labels.push(label); drawText(label, x, y); };
    const canvasRenderer = new Renderer(canvas, Renderer.Backends.CANVAS);
    artist.setOptions({ width: '400', scale: '0.75' });
    artist.draw(renderer);
    const scaled = ink(host);
    const view = host.querySelector('svg').getAttribute('viewBox');
    artist.draw(renderer);
    assert.deepEqual(ink(host), scaled);
    assert.equal(host.querySelector('svg').getAttribute('viewBox'), view);
    assert.equal(host.querySelector('svg').getAttribute('width'), '300');
    artist.draw(canvasRenderer);
    const pixels = canvas.toDataURL();
    artist.draw(canvasRenderer);
    assert.equal(canvas.toDataURL(), pixels);
    assert.false(labels.includes('vexflow.com'));
    assert.true(labels.length > 0);
    artist.setOptions({ width: '600', scale: '1' });
    artist.draw(renderer);
    assert.deepEqual(ink(host), previous);
    assert.false(host.textContent.includes('vexflow.com'));
    assert.equal(artist.getPlayerData().voices.length, 1);
    assert.deepEqual(ink(other.host), otherInk);
  });

  QUnit.test('Invalid revisions use original locations and clear the public valid flag', assert => {
    const { parser, artist } = legacy('stave\nnotes C/4');
    for (const [source, error] of [
      ['stave\r\n    notes :8 1/2 ?', /line 2 column 17/],
      ['  options width=half', /line 1 column 10/],
      ['tabstave tablature=false', /invisible/],
      ['stave notation=false', /invisible/],
      ['tabstave strings=5.5', /number of strings/],
      ['  stave time=0/8', /line 1 column 8/],
      ['options beams=explicit\nstave\nnotes :8 [ C-D/4', /closing beam/],
      ['options beams=explicit\nstave\nnotes :8 [ C/4 | D/4 ]', /crosses a bar/],
      ['stave\nnotes :8 C/4 | C/4 ^3^', /tuplet/],
    ] as const) {
      artist.reset();
      assert.throws(() => parser.parse(source), error);
      assert.false(parser.isValid());
    }
    artist.reset();
    parser.parse('stave\nnotes :8 [ C-D/4');
    assert.true(parser.isValid(), 'Default beaming accepts historical unmatched brackets');
  });

  QUnit.test('Editor keeps the complete SVG or Canvas on syntax and draw failures', assert => {
    for (const backend of ['svg', 'canvas']) {
      const host = document.createElement('div');
      host.setAttribute('renderer', backend);
      host.setAttribute('show-errors', 'true');
      host.textContent = 'stave\nnotes C/4';
      document.querySelector('#qunit-fixture').append(host);
      const editor = new Div(host, { language: 1 }) as any;
      const first = host.querySelector('.vex-canvas');
      editor.code = 'stave\nnotes ?';
      editor.redraw();
      assert.strictEqual(host.querySelector('.vex-canvas'), first);
      assert.equal(first.getAttribute('data-preview-stale'), 'true');
      editor.code = 'stave\nnotes E/4';
      const draw = editor.artist.draw;
      editor.artist.draw = function (renderer) { draw.call(this, renderer); throw new Error('late draw failure'); };
      editor.redraw();
      assert.strictEqual(host.querySelector('.vex-canvas'), first);
      assert.true(host.querySelector('[role=status]').textContent.includes('late draw failure'));
      editor.artist.draw = draw;
      editor.redraw();
      assert.notStrictEqual(host.querySelector('.vex-canvas'), first);
      assert.equal(host.querySelectorAll('.vex-canvas').length, 1);
      assert.equal(host.querySelector('[role=status]').textContent, '');
    }
  });
});
