// Verify that authored notes, marks and verse lanes survive each fresh screen, part and cue.
import { Accidental, Annotation, Articulation, FretHandFinger, StaveNote, TabNote, type StemmableNote } from 'vexflow';
import { renderScore, renderScorePart } from '../src/score/layout';
import { parseScore } from '../src/score/parse';
import river from '../guide/scores/slow-river.vextab';
import sor from '../issues/196/sor-op35-no22.vextab';

/** Font metrics and pagination need a connected host. */
function host() {
  return document.querySelector('#qunit-fixture').appendChild(document.createElement('div'));
}

/** Read the printed words at their actual SVG baselines. */
function verse(root: Element) {
  return [...root.querySelectorAll('text')].filter(n => ['roll', 'to', 'sea'].includes(n.textContent));
}

QUnit.module('Independent part engraving', () => {
  QUnit.test('singleton marks locate their second spelling, including in persisted scores', assert => {
    for (const [marks, second] of [
      ['lyric "one", lyric "two"', 'lyric "two"'], ['symbol "C", symbol "D"', 'symbol "D"'],
      ['ink red, ink green', 'ink green'], ['showSign, courtesy', 'courtesy'],
    ]) {
      const source = 'pattern phrase { C4[' + marks + '] } meter 1/4 staff { use phrase | }';
      assert.throws(() => parseScore(source), e => source.slice(...e.range) === second && e.trace[0].pattern === 'phrase');
    }
    const source = 'meter 1/4 staff { C4[lyric "one", label "two"] | }';
    const score = parseScore(source);
    const marks = score.parts[0].staves[0].voices[0].events[0].marks;
    const range = marks[1].range;
    marks[1] = { kind: 'lyric', text: 'two', extend: 0, hyphen: false, range };
    assert.throws(() => renderScorePart(host(), score, 'notation'), e => e.range.start === range[0]);
    const labels = parseScore('meter 1/4 staff { C4[label "one", label "two"] | }');
    const print = renderScorePart(host(), labels, 'notation').publication;
    assert.ok(['one', 'two'].every(word => print.pages[0].svg.textContent.includes(word)));
  });

  QUnit.test('Slow River fits its verse on one system and counts the diagram as printable ink', assert => {
    const score = parseScore(river), root = host();
    for (const width of [560, 360, 560]) {
      const view = renderScore(root, score, { width });
      if (width === 560) {
        assert.deepEqual(view.composition.sheet.getContinuousLayout().rows[1].measures, [2, 3, 4]);
        assert.equal(new Set(verse(root).map(el => el.getAttribute('y'))).size, 1);
        assert.equal(verse(root).length, 3);
      }
    }
    const canvas = renderScore(root, score, { width: 560, renderer: 'canvas' });
    const baselines = canvas.composition.notes.slice(1, 4).map(staves => staves[0][0][0].getModifiers()
      .find((m): m is Annotation => m instanceof Annotation && m.phraseManaged && m.getVerticalJustification() === Annotation.VerticalJustify.BOTTOM).computeY().y);
    assert.equal(new Set(baselines).size, 1);
    for (const paper of ['A4', 'Letter'] as const) {
      const pub = renderScorePart(root, score, 'notation', { paper }).publication;
      assert.deepEqual(pub.diagnostics, []);
      const page = pub.pages[0].svg;
      const first = page.querySelector('[data-system="1"]');
      const diagram = first.querySelector('.vf-chord-frames').getBoundingClientRect();
      const stave = first.querySelector('.vf-stave').getBoundingClientRect();
      assert.ok(diagram.width > 0 && diagram.bottom < stave.top);
      assert.equal(new Set(verse(first).map(el => el.getAttribute('y'))).size, 1);
      assert.equal(verse(first).length, 3);
      assert.ok(pub.toSVG(1).includes('vf-chord-frames'));
    }
  });

  QUnit.test('two sung voices keep distinct, consistently ordered verse lanes', assert => {
    const score = parseScore('meter 1/4 staff { voice top { C5[lyric "ta"] | C5[lyric "ti"] | } voice low { C3[lyric "la"] | C4[lyric "li"] | } }');
    const root = host();
    const y = word => Number([...root.querySelectorAll('text')].find(e => e.textContent === word).getAttribute('y'));
    for (const surface of ['screen', 'paper']) {
      if (surface === 'screen') renderScore(root, score, { width: 800 });
      else renderScorePart(root, score, 'notation');
      assert.equal(y('ta'), y('ti'));
      assert.equal(y('la'), y('li'));
      assert.ok(y('la') - y('ta') > 8);
    }
  });

  QUnit.test('written beams and hidden quarters retain their members, elapsed time and following onset', assert => {
    const score = parseScore('meter 4/4 staff { beam { :8 C4 D4 E4 F4 } :q skip G4 | }');
    const screen = renderScore(host(), score);
    const notes = screen.composition.notes[0][0][0] as StemmableNote[];
    const paperNotes: StemmableNote[] = [];
    const page = renderScorePart(host(), score, 'notation', { noteHooks: [(_opts, note) => paperNotes.push(note)] }).publication.pages[0].svg;
    for (const fresh of [notes, paperNotes]) {
      assert.deepEqual(fresh[0].getBeam().getNotes().map(n => fresh.indexOf(n)), [0, 1, 2, 3]);
      assert.strictEqual(fresh[4].renderOptions.draw, false);
      assert.equal(fresh[4].getTicks().value(), 4096);
    }
    assert.equal(screen.navigation.events[5].onset, '3/4');
    assert.equal(page.querySelectorAll('.vf-beam').length, 1);
    assert.equal(page.querySelectorAll('.vf-stavenote').length, 5);
    const events = JSON.parse(page.querySelector('metadata').textContent).events;
    assert.deepEqual(events.map(e => e.ticks), ['2048/1', '2048/1', '2048/1', '2048/1', '4096/1', '4096/1']);
    assert.deepEqual(events[5].keys, ['g/4']);
  });

  QUnit.test('reordered guitar heads keep one fingering, accent and forced sign on every fresh part and cue', assert => {
    for (const reverse of [false, true]) {
      const marked = '3/2[finger 2 right, courtesy, write D5, articulation "a>" above]';
      const chord = reverse ? marked + ' 0/1' : '0/1 ' + marked;
      const score = parseScore('meter 1/4 guitar { (' + chord + ') | }');
      const index = reverse ? 0 : 1;
      for (const part of ['notation', 'tab'] as const) for (let pass = 0; pass < 2; pass++) {
        const notes: StemmableNote[] = [];
        const printed = renderScorePart(host(), score, part, { regions: [{ kind: 'cue', label: 'cue', staff: part, measure: 1 }],
          noteHooks: [(_opts, note) => notes.push(note)] });
        assert.equal(notes.length, 2);
        assert.notStrictEqual(notes[0], notes[1]);
        for (const n of notes) {
          assert.equal(printed.sourceFor(n.getAttribute('id')), '1.main.main.1');
          const mods = n.getModifiers();
          assert.deepEqual(mods.filter(m => m instanceof FretHandFinger).map(m => [m.getIndex(), m.getFretHandFinger()]), [[index, n instanceof TabNote ? '\ue835' : '2']]);
          assert.deepEqual(mods.filter(m => m instanceof Articulation).map(m => m.getIndex()), [index]);
          if (n instanceof TabNote) assert.deepEqual(n.getPositions()[index], { str: 2, fret: 3 });
          if (n instanceof StaveNote) {
            assert.equal(n.getKeys()[index].toLowerCase(), 'd/5');
            assert.deepEqual(mods.filter(m => m instanceof Accidental).map(m => [m.getIndex(), m.type, m.isCautionary()]), [[index, 'n', true]]);
          }
        }
      }
    }
  });

  QUnit.test('mixed TAB endings use native spans when the bars supply compatible anchors', assert => {
    for (const [body, fallback] of [[':h rest 0/1 | :w 2/1 |', false], [':w rest | :w 2/1 |', true]] as const) {
      const score = parseScore('meter 4/4 guitar { view tab volta 2 { :w 0/1 | } ending 1 { ' + body + ' } ending 2 { :w 0/1 | } }');
      const target = host();
      const view = renderScore(target, score, { width: 230 });
      const ending = view.score.spans.find(mark => mark.kind === 'volta');
      const regions = [...view.navigation.regions, ...view.extraRegions].filter(r => r.source === ending.id);
      assert.ok(regions.length);
      assert.ok(score.source.slice(ending.range.start, ending.range.end).includes('ending 1'));
      assert.equal(!!target.querySelector('.vf-tab-ending'), fallback);
      const pub = renderScorePart(target, score, 'tab').publication;
      assert.equal(!!pub.pages[0].svg.querySelector('.vf-tab-ending'), fallback);
      assert.ok(pub.toSVG(1).includes('1.'));
    }
  });

  QUnit.test('hiding the clef preserves the written pitch on each system in notation and print', assert => {
    const score = parseScore('staff { clef none :w C4 | break system D4 | }');
    const root = host();
    const view = renderScore(root, score);
    assert.deepEqual(view.composition.notes.map(s => (s[0][0][0] as StaveNote).getKeys()), [['c/4'], ['d/4']]);
    const ink = () => [...root.querySelectorAll('.vf-clef text')].map(el => el.textContent).join('');
    assert.equal(ink(), '');
    renderScorePart(root, score, 'notation');
    assert.equal(ink(), '');
  });

  QUnit.test('Sor places the bass tie below TAB and reserves ink clearance for both altered fingerings', assert => {
    const source = parseScore(sor), root = host();
    const view = renderScore(root, source, {width:920});
    const tie = view.composition.sheet.getContinuousLayout().fragments.find(f => f.kind === 'tie' && f.strings?.includes(5));
    assert.strictEqual(tie.above, false);
    const check = (group: Element, digit: string) => {
      const texts = [...group.querySelectorAll('text')];
      const sharp = texts.find(t => t.textContent === '\ue262').getBBox();
      const finger = texts.find(t => t.textContent === digit).getBBox();
      assert.ok(finger.x >= sharp.x + sharp.width + 1, 'finger clears the sharp by at least one layout unit');
    };
    const visible = (id: string) => root.querySelector('[id="vf-' + view.navigation.events.find(e => e.source === id && !e.id.includes('-tab-')).id + '"]');
    check(visible('1.main.melody.14'), '1');
    check(visible('1.main.accompaniment.45'), '2');
    // Both voices write E-sharp on the same string in bar 7. Each extracted voice needs a sign.
    for (const voice of [undefined,1,2]) {
      const printed = renderScorePart(host(),source,'notation',{voice});
      const groups = printed.publication.pages.flatMap(p => [...p.svg.querySelectorAll('.vf-stavenote')]);
      const notes = groups.filter(g => ['1.main.melody.14','1.main.accompaniment.41'].includes(printed.sourceFor(g.getAttribute('data-vf-id')?.replace(/^vf-/,''))));
      assert.equal(notes.flatMap(g => [...g.querySelectorAll('text')]).filter(t => t.textContent === '\ue262').length,1);
      if (voice !== 2) check(notes.find(g => [...g.querySelectorAll('text')].some(t => t.textContent === '1')), '1');
    }
  });

  QUnit.test('a letter fingering retains its text on TAB beside an enclosed open-string zero', assert => {
    const root = host();
    const view = renderScore(root,parseScore('meter 2/4 guitar { :q 0/1[finger 0] 3/2[finger T] | }'),{part:'tab'});
    const notes = view.navigation.events.map(e => view.composition.getNote(e.id));
    assert.deepEqual(notes.map(n => n.getModifiers().find(m => m instanceof FretHandFinger).getText()), ['\ue833','T']);
  });

  QUnit.test('Sor’s eight-bar opening prints its three independent voices and the opening finger on string two', assert => {
    const source = parseScore(sor);
    assert.equal(source.parts[0].staves[0].voices.length, 3);
    assert.equal(source.measureCount, 8);
    for (const part of ['notation', 'tab'] as const) {
      const first: StemmableNote[] = [];
      const print = renderScorePart(host(), source, part, { noteHooks: [(opts, note) => {
        if (opts.id.endsWith('-1.main.melody.1')) first.push(note);
      }] }).publication;
      assert.deepEqual(print.diagnostics, []);
      assert.equal(print.pages.length, 1);
      assert.equal(first.length, 1);
      assert.deepEqual(first[0].getModifiers().filter(m => m instanceof FretHandFinger).map(m => [m.getIndex(), m.getFretHandFinger()]), [[0, part === 'tab' ? '\ue835' : '2']]);
      if (first[0] instanceof TabNote) assert.deepEqual(first[0].getPositions(), [{ str: 2, fret: 3 }]);
    }
  });
});
