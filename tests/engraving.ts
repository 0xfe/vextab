// Musical regressions for the fixed-row renderer and public editor.
import Artist from '../src/artist';
import { renderScore, renderScorePart } from '../src/score/layout';
import { parseScore, ScoreError } from '../src/score/parse';
import type { StaveNote } from 'vexflow';
import Div from '../src/div';
import Vex from '../src/vexflow';
import VexTab from '../src/vextab';

const { Renderer, Barline, Annotation, Accidental } = Vex.Flow;

/** Render through the same public entry points used by browser embeds. */
function score(source: string) {
  const host = document.createElement('div');
  document.querySelector('#qunit-fixture').append(host);
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  const artist = new Artist(10, 10, 600);
  const parser = new VexTab(artist);
  parser.parse(source);
  artist.draw(renderer);
  return { artist, parser, host, renderer, group: artist.staves[0] };
}

/** Compare visible SVG shapes and text without counting generated element IDs. */
function ink(host: HTMLElement) {
  return Array.from(host.querySelectorAll('text,path,rect')).map(el =>
    [el.textContent, ...['x', 'y', 'd', 'width', 'height', 'transform'].map(a => el.getAttribute(a))]);
}

QUnit.module('Engraving', () => {
  QUnit.test('A pre-bent fret sounds at the raised pitch for one written attack', assert => {
    const source = 'tabstave notation=true time=2/4\nnotes :q (5/2.7z8z7/3) 7z9/3';
    const { group, host, parser } = score(source);
    const tab = group.tab_voices[0];
    assert.equal(tab.length, 2);
    assert.deepEqual(tab[0].getPositions().map(p => p.fret), ['5', '7']);
    const bends = tab[0].getModifiers().filter(m => m instanceof Vex.Flow.Bend);
    assert.deepEqual(bends.map(m => m.getIndex()), [1]);
    assert.deepEqual(tab[0].getPlayNote().map(s => s.toLowerCase()), ['e/5', 'd#/5']);
    assert.ok([...host.querySelectorAll('text')].some(t => t.textContent === '½'));
    assert.throws(() => parser.parse(source.replace('7z8z7', '7z7')), /above the fretted pitch/);
    assert.throws(() => parser.parse(source.replace('7z8z7', '7z8z6')), /original fret/);
    const onlyStaff = score('stave\nnotes :q 7z8z7/3');
    assert.ok(onlyStaff.host.textContent.includes('Pre-bend ½ on string 3, release'));
  });

  QUnit.test('Fixed SVG embeds clear every fret with opaque paper', assert => {
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
      host.textContent = 'tabstave\nnotes :q 0/1 12/1 (10/2.12/3) 4/1 |';
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
    const { host } = score(source);
    const parsed = parseScore(source);
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
      const legacy = score(source);
      const flow = renderScore(legacy.host, parseScore(source));
      for (const notes of [legacy.group.note_notes, flow.composition.notes[0][0][0]]) {
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

  QUnit.test('Fixed annotations default to Academico and respect an authored face', assert => {
    const { group } = score('stave\nnotes :q C/4 $Am$ D/4 $.italic.hold$ E/4 $.Times-12-bold.F$');
    const fonts = group.note_notes.map(note => note.getModifiers().find(m => m instanceof Annotation).fontInfo.family);
    assert.deepEqual(fonts, ['Academico','Academico','Times']);
  });

  QUnit.test('A quoted option sets a multi-word font on the rendered label', assert => {
    const options = 'options font-face="Times New Roman" font-style=bold';
    const { host, parser } = score(options + '\nstave\nnotes :q C/4 $Am$');
    const label = [...host.querySelectorAll('svg text')].find(el => el.textContent === 'Am');
    assert.equal(label.getAttribute('font-family'), 'Times New Roman');
    assert.equal(label.getAttribute('font-weight'), 'bold');
    assert.throws(() => parser.parse('options font-face="Times\nstave'), /Unexpected text/);
    // The flow editor selects the complete option when it directs the author to fixed layout.
    const flowSource = 'options beams=auto font-face="Times New Roman"\nstave';
    assert.throws(() => parseScore(flowSource), error => error instanceof ScoreError &&
      error.code === 'fixed-layout' && flowSource.slice(error.range.start, error.range.end) === 'font-face="Times New Roman"');
  });

  QUnit.test('A tuplet keeps exact time in every projection, including a silent rest', assert => {
    for (const stave of ['stave', 'tabstave', 'tabstave notation=true']) {
      for (const stems of ['true', 'false']) {
        const { group } = score(`options tab-stems=${stems}\n${stave}\nnotes :8 1/2 ## 3/2 ^3^`);
        for (const notes of [group.tab_notes, group.note_notes].filter(ns => ns.length)) {
          assert.deepEqual(notes.map(n => n.getTicks().clone().simplify().toString()), Array(3).fill('4096/3'));
        }
      }
    }
    const paired = score('options tab-stems=true\ntabstave notation=true\nnotes :8 1-2-3/1 ^3^');
    const upper = paired.artist.stave_articulations[0].getBoundingBox();
    const lower = paired.artist.tab_articulations[0].getBoundingBox();
    assert.true(upper.y + upper.h < lower.y - 2, 'Both triplet numbers clear each other');
    const tabOnly = score('options tab-stems=true\ntabstave\nnotes :8 1-2-3/1 ^3^');
    assert.true(tabOnly.artist.tab_articulations[0].getBoundingBox().y >= 10, 'The tab numeral clears the top edge');
    const { group } = score('tabstave notation=true time=6/8\nnotes :8 1-2/1 ^2^ :qSdd 3/1');
    for (const notes of [group.note_notes, group.tab_notes]) {
      assert.deepEqual(notes.map(n => n.getTicks().value()), [3072, 3072, 7168]);
      assert.equal(notes[2].getModifiers().filter(m => m.getCategory() === 'Dot').length, 2);
    }
  });

  QUnit.test('6/8 groups, explicit beams and independent voice stems', assert => {
    const first = score('stave time=6/8 show-time=false\nnotes :8 C-D-E-F-G-A/4');
    const ns = first.group.note_notes;
    assert.equal(first.artist.player_voices[0][0].getTotalTicks().value(), 12288);
    assert.deepEqual(ns[0].getBeam().getNotes(), ns.slice(0, 3));
    assert.deepEqual(ns[3].getBeam().getNotes(), ns.slice(3));
    assert.false(first.group.note.getModifiers().some(m => m.getCategory() === 'TimeSignature'));
    const { group } = score('options beams=explicit\nstave voice=bottom\nnotes :8 [ C/4 :8d D/4 ] E/4 :q F/4\noptions beams=off\nvoice voice=top\nnotes :8 G-A/4 :q B/4');
    const [lower, upper] = group.note_voices;
    assert.deepEqual(lower[0].getBeam().getNotes(), lower.slice(0, 2));
    assert.false(!!lower[2].getBeam());
    assert.equal(lower[3].getStemDirection(), -1);
    assert.equal(upper[2].getStemDirection(), 1);
    assert.false(!!upper[0].getBeam());
    for (const enabled of ['true', 'false']) {
      const rest = score(`options beam-rests=${enabled}\nstave\nnotes :8 C/4 ## D-E/4`).group.note_notes[1];
      assert.equal(!!rest.getBeam(), enabled === 'true');
      if (rest.getBeam()) assert.true(rest.getBeam().renderOptions.showStemlets);
    }
  });

  QUnit.test('Slash chord changes keep their beat across a bar and an explicit text bar', assert => {
    for (const spacer of ['', '|,']) {
      const { group } = score('stave\ntext :qd,G/A,:h,C/A,:8, ,:w,' + spacer + 'Fmaj7\nnotes :qSd X/5 :8S X/5 :hS sX/5 | :w X/5');
      const notes = group.note_notes.filter(n => !n.shouldIgnoreTicks());
      const labels = group.text_voices[0].filter(n => !n.shouldIgnoreTicks());
      for (const i of [0, 1, 3]) assert.equal(labels[i].getAbsoluteX(), notes[i].getAbsoluteX());
      assert.equal(notes[0].getTicks().value(), 6144);
    }
  });

  QUnit.test('Upper tab annotations stay above the staff and preserve fret numbers', assert => {
    const { group } = score('tabstave\nnotes 4-5-6/3 10/1 $.top.$ $A,B,C$ | 5d-4u-Xd/3 2/2 $.top.$ $A,B,C$');
    const marks = group.tab_notes.flatMap(n => n.getModifiers()).filter(m => m instanceof Annotation);
    assert.deepEqual(marks.map(m => m.getText()), ['A', 'B', 'C', 'A', 'B', 'C']);
    assert.equal(new Set(marks.map(m => m.computeY().y)).size, 1);
    assert.true(marks[0].computeY().y < group.tab.getYForLine(0));
    assert.equal(group.tab_notes[1].fretElement[0].getText(), '5');
  });

  QUnit.test('Rests use staff coordinates on four strings and ledger glyphs outside five lines', assert => {
    const { group } = score('options tab-stems=true\ntabstave notation=true strings=4 tuning=G/5,D/5,A/4,E/4\nnotes :h #2# #0# :w #9#');
    const [staff, tab] = [group.note_notes, group.tab_notes];
    assert.equal(staff[0].getYs()[0], group.note.getYForLine(3.5));
    assert.equal(tab[0].getYs()[0], group.tab.getYForLine(2.5));
    assert.equal(staff[1].noteHeads[0].getText(), '\uE4F5');
    assert.equal(staff[2].noteHeads[0].getText(), '\uE4F4');
  });

  QUnit.test('Chord permutations retain accidental glyph and fingering ownership', assert => {
    for (const [chord, member] of [['G/5.C/5.E@/4.B/4', 3], ['E@/4.B/4.C/5.G/5', 1]]) {
      const { group, host } = score(`stave key=F\nnotes (${chord}) $.fingering/${member}:r:f:2.$`);
      const note = group.note_notes[0];
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
    const { group } = score('tabstave notation=true key=A tuning=G/5,G/4,D/4,A/3,E/3,B/2\nnotes :q 0/1 0/2 0/1 | 0/1');
    assert.deepEqual(group.note_notes.filter(n => !n.shouldIgnoreTicks()).map(signs),
      [[['n', false]], [['n', false]], [], [['n', false]]]);
    // The lower voice cancels G-sharp on beat one, regardless of declaration order.
    for (const voices of [['## 0/3', '0/3 ##'], ['0/3 ##', '## 0/3']]) {
      const { group } = score(`stave key=A\nnotes :q ${voices[0]}\nvoice\nnotes :q ${voices[1]}`);
      const sorted = group.note_voices.flatMap(ns => ns.map((n,i) => ({ n, i })))
        .filter(e => !e.n.isRest()).sort((a,b) => a.i - b.i);
      assert.deepEqual(sorted.map(e => signs(e.n)), [[['n', false]], []]);
    }
    assert.deepEqual(signs(score('stave key=F\nnotes B@~/4').group.note_notes[0]), [['b', true]]);
  });

  QUnit.test('Reordered ties cross the bar after a triplet and stay on the written head', assert => {
    for (const [phrase, chord, repeat] of [
      ['1-2-3/2', '(1/2.0/3)', '(0/3.1/2)'],
      ['C-D-E/4', '(C/4.E/4)', '(E/4.C/4)'],
    ]) {
      const { artist, group } = score(`tabstave notation=true\nnotes :8 ${phrase} ^3^ :q ${chord} T${chord} | T${repeat}`);
      const ties = artist.stave_articulations.filter(m => m.getCategory() === 'StaveTie');
      assert.equal(ties.length, 2);
      const tie = ties[1].getNotes();
      assert.strictEqual(tie.firstNote, group.note_notes[4]);
      assert.strictEqual(tie.lastNote, group.note_notes[6]);
      assert.deepEqual(tie.firstIndexes, [1, 0]);
      assert.deepEqual(tie.lastIndexes, [0, 1]);
      assert.true(ties[1].getRibbonBounds().w > 0);
    }
  });

  QUnit.test('Repeated draws, width, backend and a second Artist preserve the score', assert => {
    const { artist, group, renderer, host } = score('options tab-stems=true\ntabstave notation=true\nnotes =|: :8 1-2-3/1 ^3^ =:: 4/1 =:|');
    const other = score('stave\nnotes :q C/4');
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
    const { parser, artist } = score('stave\nnotes C/4');
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
      const editor = new Div(host) as any;
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
