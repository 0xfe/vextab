// Check a shared conductor grid, independent player parts, editor selection and sounding intervals.
import { Div, parseScore, Player, renderConductor, renderScore, renderScorePart, ScoreError } from '../src/browser';
import { scoreSurfaces } from '../src/playback/geometry';
import { scorePerformance } from '../src/playback/performance';
import haydn from '../guide/scores/haydn-emperor-theme.vextab';

function host() {
  return document.querySelector('#qunit-fixture').appendChild(document.createElement('div'));
}

/** Compare actual simultaneous note anchors across all voices, and right barlines on every stave. */
function aligned(view: ReturnType<typeof renderConductor>) {
  const positions = new Map<string, number>();
  for (const event of view.navigation.events) {
    const where = event.measure + ':' + event.onset;
    const x = view.composition.getNote(event.id).getAbsoluteX();
    if (positions.has(where) && Math.abs(positions.get(where) - x) > 0.01) return false;
    positions.set(where, x);
  }
  return view.composition.staves.every(staves => {
    const edges = staves.map(stave => stave.getX() + stave.getWidth());
    return Math.max(...edges) - Math.min(...edges) < 0.01;
  });
}

QUnit.module('Conductor scores and extracted parts', () => {
  QUnit.test('the complete Haydn theme reflows together and all four players can print and find their notes', assert => {
    const score = parseScore(haydn);
    const players = ['violin_i', 'violin_ii', 'viola', 'cello'];
    assert.deepEqual(score.parts.map(p => p.id), players);
    assert.equal(score.measureCount, 21, 'pickup, 19 complete measures and the final half bar');
    const target = host();
    const views = [800, 360, 800].map(width => renderConductor(target, score, { width }));
    const rows = views.map(v => v.composition.sheet.getContinuousLayout().rows.map(row => row.measures));
    assert.ok(rows[1].length > rows[0].length);
    assert.deepEqual(rows[0], rows[2]);
    for (const view of views) {
      assert.equal(view.navigation.events.length, 317, 'every attack and rest appears once');
      assert.ok(aligned(view), 'shared attacks and barlines align');
      assert.ok(view.composition.staves.every(staves => staves.length === 4));
    }
    assert.equal(target.querySelectorAll('svg').length, 1);
    assert.ok(target.textContent.includes('Violoncello'));
    const shared = views[1];
    players.forEach((partId, index) => {
      const solo = renderScore(host(), score, { partId, width: 360 });
      assert.equal(solo.score, renderScore(host(), score, { partIndex: index }).score);
      const first = solo.navigation.events[0];
      const conductorNote = shared.navigation.events.find(event => event.source === first.source);
      assert.equal(conductorNote.staff, partId + '.main');
      assert.deepEqual(shared.rangeFor(conductorNote.id, haydn), solo.rangeFor(first.id, haydn));
      assert.equal(shared.rangeFor(conductorNote.id, haydn + ' '), undefined);
      const print = renderScorePart(host(), score, 'notation', { partId });
      assert.deepEqual(print.publication.diagnostics, []);
      const printed = print.publication.pages.flatMap(page => [...page.svg.querySelectorAll('.vf-stavenote')]);
      assert.equal(printed.length, solo.navigation.events.length, 'all written attacks and rests reach the part');
      printed.forEach((glyph, i) => {
        const id = glyph.getAttribute('data-vf-id').slice(3);
        assert.equal(print.sourceFor(id), solo.navigation.events[i].source);
      });
      const firstPrinted = printed[0].getAttribute('data-vf-id').slice(3);
      assert.deepEqual(print.rangeFor(firstPrinted, haydn), shared.rangeFor(conductorNote.id, haydn));
    });
  });

  QUnit.test('the melody and bass from M0 keep distinct extraction breaks and one stable live conductor revision', assert => {
    const source = 'meter 4/4 staff melody { times 4 { :8 C4 D4 E4 F4 G4 F4 E4 D4 | } } '
      + 'staff bass { clef bass times 4 { :w C3 | } }';
    const score = parseScore(source);
    const localRows = score.parts.map(p => renderScore(host(), score, { partId: p.id, width: 360 }).composition.sheet.getRows().length);
    assert.deepEqual(localRows, [4, 1]);
    const root = host(); root.textContent = source; root.setAttribute('data-editor', 'true');
    const editor = new Div(root, { view: 'conductor' });
    try {
      const revision = editor.getScore();
      for (const width of [800, 360, 800]) {
        editor.setWidth(width);
        assert.equal(root.querySelectorAll('svg').length, 1);
        assert.equal(editor.getScore(), revision);
        const reading = editor.getReadingEvents();
        assert.equal(reading.length, 36);
        const bass = reading.find(event => event.source === 'bass.main.main.1');
        assert.ok(editor.selectSource(bass.id, revision));
        const field = root.querySelector('textarea');
        assert.equal(field.value.slice(field.selectionStart, field.selectionEnd), 'C3');
      }
    } finally { editor.dispose(); }
  });

  QUnit.test('two named piano hands and paired guitar staves retain independent owners, modifiers and groups', assert => {
    const source = 'meter 1/4 piano keys { name "Piano" upper treble { name "Right" C4 | } lower bass { name "Left" C3 | } } '
      + 'guitar frets { name "Guitar" stave strings { name "Gtr." } view both 0/1 | }';
    const model = parseScore(source);
    for (const renderer of ['svg', 'canvas'] as const) {
      const root = host(), view = renderConductor(root, model, { width: 480, renderer });
      const reading = view.navigation.events;
      assert.deepEqual(reading.map(n => n.staff), ['keys.treble', 'keys.bass', 'frets.strings.notation', 'frets.strings.tab']);
      assert.deepEqual(reading.map(n => n.source), ['keys.treble.main.1','keys.bass.main.1','frets.strings.main.1','frets.strings.main.1']);
      assert.equal(scoreSurfaces.get(root.querySelector('svg,canvas')).read().size, 3, 'one attack per written owner');
      assert.ok(aligned(view));
      if (renderer === 'svg') {
        const brace = [...root.querySelectorAll('path')].some(p => (p.getAttribute('d')?.match(/C/g) ?? []).length === 4);
        assert.ok(brace, 'native piano brace');
        assert.equal([...root.querySelectorAll('text')].filter(t => t.textContent === '\uE003').length, 2,
          'native brackets enclose the paired guitar and the complete ensemble');
      }
    }
    const reversed = parseScore('meter 1/4 guitar frets { stave strings {} 0/1 | } piano keys { upper treble { C4 | } lower bass { C3 | } }');
    assert.equal(reversed.parts[1].staves[0].voices[0].events[0].id, 'keys.treble.main.1');
    for (const bad of ['staff a { C4 | } staff a { D4 | }', 'piano { upper same { C4 | } lower same { C3 | } }']) {
      assert.throws(() => parseScore(bad), /Duplicate .* ID/);
    }
  });

  QUnit.test('written D on a B-flat clarinet sounds C in both the full ensemble and its independent part', async assert => {
    const source = 'meter 1/4 staff clarinet { name "Clarinet in B-flat" shortName "Cl." sounds -2 D4 | } staff cello { C3 | }';
    const model = parseScore(source);
    const full = renderConductor(host(), model);
    assert.deepEqual(full.composition.getNote(full.navigation.events[0].id).getKeys(), ['d/4']);
    const part = renderScorePart(host(), model, 'notation', { partId: 'clarinet' });
    assert.equal(part.score.measures[0].voices[0].events[0].heads[0].written, 'd/4');
    assert.equal(scorePerformance(part.score, 60).events[0].notes[0].pitch, 60);
    for (const [options, pitches] of [[{}, [48,60]], [{ partId: 'clarinet' }, [60]]] as const) {
      const played: number[] = [];
      const player = new Player(model, { ...options, controls: host(), playback: { open: () => ({
        playNote(note) { played.push(note.pitch); }, stop() {},
      }) } });
      try { await player.play(); } finally { player.dispose(); }
      assert.deepEqual(played.sort((a,b) => a-b), pitches);
    }
    const guitar = parseScore('meter 1/4 guitar g { sounds -12 view both 0/1 | }');
    const fret = renderConductor(host(), guitar).parts[0].measures[0].voices[0].events[0].heads[0];
    assert.deepEqual([fret.written, fret.sounding], ['e/5', 'e/4'], 'an explicit guitar interval is measured from written pitch');
    const staffInterval = parseScore('meter 1/4 piano p { sounds -2 upper { sounds 0 D4 | } lower { C3 | } }');
    assert.deepEqual(scorePerformance(renderConductor(host(), staffInterval).score, 60).events.map(e => e.notes[0].pitch), [62,46]);
  });

  QUnit.test('an incompatible grid points at the second meter and leaves both independent clocks usable', assert => {
    const commonSpan = parseScore('staff { meter 3/4 times 2 { :h. C4 | } } staff { meter 6/8 :h. E4 | break system :h. G4 | }');
    const alignedMeters = renderConductor(host(), commonSpan, { width: 800 });
    assert.deepEqual(alignedMeters.composition.sheet.getContinuousLayout().rows.map(row => row.measures), [[1],[2]],
      'equal spans share a system grid and a break authored by the second player');
    const source = 'staff waltz { meter 3/4 times 2 { :h. C4 | } } staff march { meter 2/4 times 3 { :h D4 | } }';
    const score = parseScore(source);
    const root = host(); root.textContent = 'previous score';
    try {
      renderConductor(root, score);
      assert.ok(false, 'an unequal bar cannot be shared');
    } catch (error) {
      assert.ok(error instanceof ScoreError);
      assert.equal(source.slice(error.range.start, error.range.end), '2/4');
      assert.equal(root.textContent, 'previous score');
    }
    for (const [id, bars] of [['waltz', 2], ['march', 3]] as const) {
      const part = renderScorePart(host(), score, 'notation', { partId: id });
      assert.equal(part.score.measures.length, bars);
      assert.equal(scorePerformance(part.score, 60).duration, 6);
    }
  });
});
