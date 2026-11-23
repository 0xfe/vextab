// Exercise aligned piano timing, clefs and connectors, independent hand parts, and located diagnostics.
import { VexFlow, type StaveNote } from 'vexflow';
import consolation from '../guide/scores/liszt-consolation-no5.vextab';
import { Div, parseScore, renderScore, renderScorePart } from '../src/browser';
import { projectScoreV2 } from '../src/score/grammar2/project';
import { scoreSurfaces } from '../src/playback/geometry';
import { scorePerformance } from '../src/playback/performance';

const duet = 'meter 4/4 piano { upper { C4 D4 E4 F4 | G4 A4 B4 C5 | } lower { :h C3 G2 | G2[tie] C3 | } }';
function read(source: string) { return projectScoreV2(parseScore(source)); }

/** Attach scores so Chrome measures the same glyph and page geometry as an embed. */
function host(): HTMLElement {
  const el = document.createElement('div');
  document.querySelector('#qunit-fixture').append(el);
  return el;
}

/** A piano brace is one closed shape made from four cubic curves. */
function bracePaths(element: Element): number {
  return [...element.querySelectorAll('path')].filter(path =>
    (path.getAttribute('d')?.match(/C/g) ?? []).length === 4).length;
}

QUnit.module('Piano grand staff', () => {
  QUnit.test('Each hand can choose level beams and vertical fingerings follow pitch order', assert => {
    const score = read('meter 2/4 piano { upper { voice melody stem down { :8 (C5[finger 3 above] G5[finger 5 above])[staccato above] E5 D5 F5 | } } lower { voice bass flatBeams on { :8 C3 G3 E3 G3 | } } }');
    const [upper, lower] = score.measures[0].voices;
    assert.notOk(upper.flatBeams);
    assert.true(lower.flatBeams);
    const root = host();
    renderScore(root, score);
    const marks = [...root.querySelectorAll<SVGTextElement>('.vf-stavenote text')];
    // SVG text boxes include the entire em square. Compare the visible contours of the digits.
    const context = document.createElement('canvas').getContext('2d');
    const ink = (digit: string) => {
      const mark = marks.find(text => text.textContent === digit);
      const style = getComputedStyle(mark);
      context.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      const metrics = context.measureText(digit), baseline = mark.y.baseVal[0].value;
      return { top: baseline - metrics.actualBoundingBoxAscent, bottom: baseline + metrics.actualBoundingBoxDescent };
    };
    assert.ok(ink('5').bottom < ink('3').top, 'top finger clears the lower finger');
    assert.throws(() => parseScore('staff { flatBeams diagonal :w C4 | }'), /on or off/);
  });

  QUnit.test('Consolation chords keep the accompaniment below the held voices', assert => {
    const model = parseScore(consolation);
    const { composition, navigation } = renderScore(host(), model, { width: model.layout.width });
    const notes = (bar: number, voice: string) => navigation.events
      .filter(event => event.measure === bar && event.source.includes('.' + voice + '.'))
      .map(event => composition.getNote(event.id) as StaveNote);
    // The bass starts alone with up-stems; its six eighths run under another voice in the second system.
    assert.deepEqual(notes(1, 'bass').map(n => n.getStemDirection()), [1, 1]);
    const eighths = notes(7, 'bass'), quarters = notes(7, 'sustained');
    assert.deepEqual(eighths.map(n => n.getStemDirection()), [-1, -1, -1, -1, -1, -1]);
    assert.ok(eighths[0].getBeam() && eighths.every(n => n.getBeam() === eighths[0].getBeam()));
    assert.deepEqual(quarters.map(n => n.getStemDirection()), [1, 1, 1]);
    assert.deepEqual(quarters.map(n => n.getAbsoluteX()), [0, 2, 4].map(i => eighths[i].getAbsoluteX()));
    const alto = notes(7, 'inner')[1], soprano = notes(7, 'melody')[2];
    assert.deepEqual([alto.getKeys(), alto.getDuration(), alto.getStemDirection()], [['a/4'], 'q', -1]);
    assert.deepEqual([soprano.getKeys(), soprano.getDuration(), soprano.getStemDirection()], [['c#/5'], '8', 1]);
  });

  QUnit.test('Aligned beats, shared barlines, and braces survive reflow', assert => {
    const score = read(duet);
    for (const [width, rows] of [[650, 1], [225, 2]]) {
      const root = host();
      const {composition, navigation, rangeFor} = renderScore(root, score, {width});
      assert.equal(composition.sheet.getRows().length, rows);
      assert.ok(bracePaths(root) >= rows, 'each system has a brace');
      const barlines = [...root.querySelectorAll('rect')].filter(r =>
        Number(r.getAttribute('width')) === 1 && Number(r.getAttribute('height')) > 80);
      assert.ok(barlines.length >= 2, 'joined right barlines run between the two staves');
      for (const event of navigation.events.filter(e => e.staff === 'left')) {
        const simultaneous = navigation.events.find(e => e.staff === 'right' && e.measure === event.measure && e.onset === event.onset);
        const upper = composition.getNote(simultaneous.id), lower = composition.getNote(event.id);
        assert.equal(upper.getAbsoluteX(), lower.getAbsoluteX(), 'align matching onsets');
        assert.deepEqual([upper.getStave().getClef(), lower.getStave().getClef()], ['treble', 'bass']);
        assert.equal(rangeFor(event.id, duet)?.start, score.measures.flatMap(m => m.voices.flatMap(v => v.events)).find(e => e.id === event.source).range.start, 'the left-hand hit resolves to its own source');
      }
    }
    const notes = scorePerformance(score, 60).events.flatMap(e => e.notes.map(n => [e.time, n.pitch, n.duration]));
    assert.deepEqual(notes.filter(n => n[0] === 0), [[0,60,1], [0,48,2]], 'both hands sound on beat one');
    assert.deepEqual(notes.filter(n => n[1] === 43), [[2,43,4]], 'left hand sustains across the bar');
  });

  QUnit.test('a handwritten score restores both host font stacks after drawing or failing', assert => {
    const music = VexFlow.getFonts(), text = VexFlow.getTextFonts();
    try {
      VexFlow.setFonts('Bravura', 'Academico');
      VexFlow.setTextFonts('Academico', 'serif');
      const hostText = VexFlow.getTextFonts();
      const musicSource = 'piano { upper { :w C5 | } lower { :w C3 | } }';
      const handwritten = parseScore('layout { font Petaluma heading { title "Jazz" } } ' + musicSource);
      const root = host();
      for (const renderer of ['canvas', 'svg'] as const) {
        const view = renderScore(root, handwritten, { renderer });
        assert.deepEqual(view.diagnostics, []);
        assert.ok(view.composition.getNote(view.navigation.events[0].id).fontInfo.family.startsWith('Petaluma'));
        assert.deepEqual(VexFlow.getTextFonts(), hostText);
      }
      assert.equal(root.querySelector('.vf-score-heading text').getAttribute('font-family'), 'Petaluma Script');
      const plain = renderScore(host(), parseScore(musicSource));
      assert.ok(plain.composition.getNote(plain.navigation.events[0].id).fontInfo.family.startsWith('Bravura'));
      assert.throws(() => renderScore(root, handwritten, { width: 1 }), /width/);
      assert.deepEqual(VexFlow.getFonts(), ['Bravura', 'Academico']);
      assert.deepEqual(VexFlow.getTextFonts(), hostText);
      assert.throws(() => parseScore('layout { font Unknown } ' + musicSource), /Petaluma or Bravura/);
    } finally {
      VexFlow.setFonts(...music);
      VexFlow.setTextFonts(...text);
    }
  });

  QUnit.test('grand staff uses a compact default and respects an authored minimum', assert => {
    const duet = 'piano { upper { :w G4 | } lower { :w C3 | } }';
    function gap(source: string) {
      const [upper, lower] = renderScore(host(), read(source)).composition.staves[0];
      return lower.getYForLine(0) - upper.getYForLine(4);
    }
    assert.ok(gap(duet) <= 52, 'a plain grand staff leaves about five spaces between the nearest staff lines');
    assert.ok(gap('layout { staffDistance 16 } ' + duet) >= 120, 'explicit distance sets a floor');
  });

  QUnit.test('opposing extremes share vertical space on different beats', assert => {
    const distance = (lower: string) => {
      const source = 'piano { upper { :h C3 G5 | } lower { :h ' + lower + ' | } }';
      const [a, b] = renderScore(host(), read(source)).composition.staves[0];
      return b.getYForLine(0) - a.getYForLine(4);
    };
    assert.ok(distance('G4 C2') >= distance('C2 G4') + 25, 'reserve space only where the two hands meet');
  });

  QUnit.test('neighboring systems share space at different beats and keep their page margins', assert => {
    const piano = (upper: string, gap = 16) => read('layout { rowGap ' + gap + ' } piano { '
      + 'upper { :h G4 G4 | break system ' + upper + ' | } lower { :h C1 C3 | G3 G3 | } }');
    const aligned = piano('C7 G4'), staggered = piano('G4 C7');
    function screenGap(score: ReturnType<typeof read>, renderer: 'svg' | 'canvas') {
      const [first, second] = renderScore(host(), score, { width: 550, renderer }).composition.staves;
      return second[0].getYForLine(0) - first[1].getYForLine(4);
    }
    for (const backend of ['svg', 'canvas'] as const) {
      const compact = screenGap(staggered, backend);
      assert.ok(screenGap(aligned, backend) > compact + 12, backend + ' clears coincident ledger notes');
      assert.closeTo(screenGap(piano('G4 C7', 40), backend) - compact, 24, 0.01, backend + ' respects the authored row gap');
    }
    function pageGap(score: ReturnType<typeof read>) {
      const page = renderScorePart(host(), score, 'notation').publication.pages[0].svg;
      const systems = [...page.querySelectorAll('[data-system]')];
      const line = (i: number, staff: number, n: number) =>
        systems[i].querySelectorAll('.vf-stave')[staff].children[n].getBoundingClientRect().y;
      return line(1, 0, 0) - line(0, 1, 4);
    }
    assert.ok(pageGap(aligned) > pageGap(staggered) + 2, 'printed neighbors share the same open space');
    const pageTop = (score: ReturnType<typeof read>) => {
      const page = renderScorePart(host(), score, 'notation', { pageBreaks: [2] }).publication.pages[1].svg;
      return page.querySelector('[data-system]').getBoundingClientRect().top - page.getBoundingClientRect().top;
    };
    assert.closeTo(pageTop(aligned), pageTop(staggered), 1, 'the first system on a new page keeps its top margin');
  });

  QUnit.test('opening indent participates in layout and leaves the right margin aligned', assert => {
    const source = 'layout { firstSystemIndent 64 } piano { upper { :w G4 | break system G4 | } lower { :w C3 | C3 | } }';
    for (const renderer of ['svg', 'canvas'] as const) {
      const score = renderScore(host(), read(source), { width: 550, renderer });
      const [upper, next] = score.composition.staves.map(staves => staves[0]);
      assert.closeTo(upper.getX() - next.getX(), 64, 0.01);
      assert.closeTo(upper.getX() + upper.getWidth(), next.getX() + next.getWidth(), 0.01);
    }
    const print = renderScorePart(host(), read(source), 'notation').publication.pages[0].svg;
    const starts = [...print.querySelectorAll('[data-system]')].map(group =>
      group.querySelector<SVGGraphicsElement>('.vf-stave').firstElementChild.getBoundingClientRect().left);
    assert.ok(starts[0] > starts[1] + 20, 'the printed opening staff is also inset');
    assert.throws(() => parseScore(source.replace('64', '-1')), /Invalid layout dimension/);
  });

  QUnit.test('pedals sound across hands, grace chords attack together, and ossias stay on paper', assert => {
    const source = 'meter 4/4 piano { upper { C5 D5 C5 F5[grace before slashed ((G4 B4))] | } '
      + 'lower { C3[pedal down] E3[ossia :8 (E3[ornament mordent] F3 E3)] G3[pedal up] rest | } }';
    const score = read(source);
    for (const renderer of ['canvas', 'svg'] as const) {
      const view = renderScore(host(), score, { renderer });
      assert.deepEqual(view.diagnostics, []);
    }
    const paper = renderScorePart(host(), score, 'left').publication.pages[0].svg;
    assert.equal(paper.querySelectorAll('.vf-ossia .vf-stavenote').length, 3);
    assert.equal(paper.querySelectorAll('.vf-pedal text').length, 2);
    const music = scorePerformance(score, 60);
    const at = (time: number) => music.events.filter(event => event.time === time).flatMap(event => event.notes);
    assert.deepEqual(at(0).map(n => [n.pitch, n.duration]), [[72, 2], [48, 3]], 'restrike the upper C while the bass continues ringing');
    assert.equal(at(1).find(n => n.pitch === 74).duration, 2, 'right hand sustains under a left-hand pedal');
    assert.deepEqual(at(3).map(n => n.pitch), [67, 71], 'grace pitches share one onset');
    assert.deepEqual(at(3.25).map(n => n.pitch), [77]);
    assert.equal(music.duration, 4);
    assert.throws(() => read(source.replace('[pedal up]', '')), /Missing pedal up/);
    assert.throws(() => read(source.replace('[pedal down]', '')), /earlier pedal down/);
  });

  QUnit.test('Four voices keep accidental memory on the owning stave', assert => {
    const satb = 'meter 2/4 piano { upper { voice lead stem up { F#4 F#4 | } voice alto stem down { :h C4 | } } '
      + 'lower { voice tenor stem up { F4 F4 | } voice bass stem down { :h C3 | } } }';
    const score = read(satb);
    const voices = score.measures[0].voices;
    assert.deepEqual(voices.map(v => [v.hand, v.stem]), [['right','up'],['right','down'],['left','up'],['left','down']]);
    assert.deepEqual(voices[0].events.map(e => e.heads[0].sounding), ['f#/4','f#/4']);
    assert.deepEqual(voices[2].events.map(e => e.heads[0].sounding), ['f/4','f/4']);
    const screen = renderScore(host(), score);
    assert.deepEqual(screen.composition.voices[0].map(v => v.length), [2,2]);
    assert.deepEqual(screen.navigation.events.filter(e => e.onset === '0/1').map(e => e.staff), ['right','right','left','left']);
    // The printed grand staff keeps the explicit sharp on its original head and stave.
    const printed = renderScorePart(host(), score, 'notation').publication.pages[0].svg;
    const signs = [...printed.querySelectorAll('.vf-notehead text')].filter(text => text.textContent === '\uE262');
    assert.equal(signs.length, 1, 'one SMuFL sharp');
    const marked = read('meter 2/4 piano { upper { F#4 F#4[courtesy] | } lower { Fn4[showSign] F4 | } }');
    const page = renderScorePart(host(), marked, 'notation').publication.pages[0].svg;
    const heads = [...page.querySelectorAll('.vf-notehead')].map(head => head.textContent);
    assert.ok(heads[1].includes('\uE26A\uE262\uE26B'), 'cautionary sharp retains both parentheses');
    assert.ok(heads[2].includes('\uE261'), 'lower hand retains its written natural');
    // Select a voice relative to its hand.
    const {publication} = renderScorePart(host(), score, 'left', {voice:2});
    const events = JSON.parse(publication.pages[0].svg.querySelector('metadata').textContent).events;
    assert.deepEqual(events.map(e => [e.staff, e.keys]), [['left',['c/3']]]);
  });

  QUnit.test('Chord fingerings and explicit accidentals stay with their piano hand', assert => {
    const score = read('meter 2/4 piano { upper { (Fn4[finger 2, showSign] A4[finger 4 right]) G4[accent] | } lower { :h C3[finger 1] | } }');
    for (const part of ['score', 'notation', 'right', 'left'] as const) {
      const root = host();
      if (part === 'score') renderScore(root, score);
      else renderScorePart(root, score, part);
      const fingers = [...root.querySelectorAll('.vf-stavenote text')].map(el => el.textContent)
        .filter(text => ['1', '2', '4'].includes(text)).sort();
      const naturals = [...root.querySelectorAll('.vf-notehead text')].filter(el => el.textContent.includes('\uE261'));
      assert.deepEqual(fingers, part === 'left' ? ['1'] : part === 'right' ? ['2', '4'] : ['1', '2', '4'], part);
      assert.equal(naturals.length, part === 'left' ? 0 : 1, part + ' written natural');
    }
  });

  QUnit.test('Printed pages and practice hands preserve their source identities', assert => {
    const score = read(duet);
    for (const part of ['notation','right','left'] as const) {
      const root = host();
      const {publication, rangeFor} = renderScorePart(root, score, part);
      const page = publication.pages[0].svg;
      const events = JSON.parse(page.querySelector('metadata').textContent).events;
      const hands = [...new Set(events.map(e => e.staff))];
      assert.deepEqual(hands, part === 'notation' ? ['right','left'] : [part]);
      assert.equal(bracePaths(page) > 0, part === 'notation');
      for (const event of events) assert.ok(rangeFor(event.id, duet));
      assert.deepEqual(publication.diagnostics, []);
    }
    const single = renderScore(host(), score, {part:'left'});
    assert.ok(single.navigation.events.every(e => e.staff === 'left'));
    assert.ok(scorePerformance(single.score, 60).events.every(e => e.notes.every(n => n.pitch < 60)));

    const el = host();
    el.textContent = duet;
    const embed = new Div(el);
    assert.equal(embed.getReadingEvents().length, 12, 'a piano embed selects grand-staff layout');
    embed.setPart('right');
    assert.ok(embed.getReadingEvents().every(e => e.staff === 'right'));
    embed.dispose();
  });

  QUnit.test('Playback highlights the engraved hand on screen and on the printed page', assert => {
    const score = read(duet);
    for (const part of ['notation', 'right', 'left'] as const) {
      const root = host();
      const screen = renderScore(root, score, { part });
      const print = renderScorePart(host(), score, part);
      for (const [svg, music] of [[root.querySelector('svg'), screen.score], [print.publication.pages[0].svg, print.score]] as const) {
        const surface = scoreSurfaces.get(svg);
        assert.strictEqual(surface.score, music, 'the player uses the score for the selected hands');
        const geometry = surface.read();
        const attacks = music.measures.flatMap(m => m.voices.flatMap(v => v.events));
        assert.equal(geometry.size, attacks.length, 'each attack has a highlight position');
        for (const attack of attacks) assert.equal(geometry.get(attack.id)?.heads.length, 1, part + ' highlights one head per note');
      }
    }
  });

  QUnit.test('Incomplete or inconsistent hands identify the score line', assert => {
    for (const [source, error] of [
      ['meter 1/4 piano { upper { C4 | } }', /lower/],
      ['meter 1/4 piano { upper { C4 | } lower { :h C3 | } }', /bar/],
      ['meter 1/4 piano { upper { 0/1 | } lower { C3 | } }', /does not belong to piano/],
    ] as const) assert.throws(() => read(source), error);
  });
});
