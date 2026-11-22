// Compare musical and engraved results from both score languages at the public entry points.
import { TimeSignature } from 'vexflow';
import { Div, parseScore, Player, renderScore, renderScorePart } from '../src/browser';
import { scorePerformance } from '../src/playback/performance';
import { scoreSurfaces } from '../src/playback/geometry';

function host() {
  return document.querySelector('#qunit-fixture').appendChild(document.createElement('div'));
}

/** Ignore language-specific event IDs and compare what the instrument actually plays. */
function performance(score: ReturnType<typeof renderScore>['score']) {
  return scorePerformance(score, 60).events.map(e => [e.time, e.duration, e.notes] as const);
}

QUnit.module('Grammar v2 score views', () => {
  QUnit.test('fret, pitch, slide and per-string bend agree with v1 on both drawing backends', assert => {
    const old = parseScore('tabstave notation=true time=3/4 tuning=dropd capo=2\nnotes :q <0/6 (0/6.7z9z7/3) (0/6.7/3) !bend 3 +2 rise=1/2 release=1/1! |', { language: 1 });
    const source = 'meter 3/4 guitar { tuning dropD capo 2 0/6[slideIn below] (0/6 7/3[prebend +2 release]) (0/6 7/3[bend +2 rise=1/2 release=1]) | }';
    const score = parseScore(source);
    for (const renderer of ['svg','canvas'] as const) {
      const root = host();
      const view = renderScore(root, score, { renderer, width: 510 });
      assert.deepEqual(performance(view.score), performance(old));
      assert.deepEqual(view.score.measures[0].voices[0].events.map(e => e.heads.map(h => h.position)),
        old.measures[0].voices[0].events.map(e => e.heads.map(h => h.position)));
      const first = view.navigation.events[0];
      const range = view.rangeFor(first.id, source);
      assert.equal(source.slice(range.start, range.end), '0/6[slideIn below]');
      if (renderer === 'svg') assert.equal(root.querySelectorAll('.vf-open-slide').length, 1);
      else {
        const canvas = root.querySelector('canvas');
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        assert.ok(pixels.some((n, i) => i % 4 === 3 && n > 0), 'Canvas contains engraved ink');
      }
    }
    assert.equal(renderScorePart(host(), score, 'tab').publication.diagnostics.length, 0);
  });

  QUnit.test('guitar phrase slurs follow both staves across a system break', assert => {
    const score = parseScore('meter 2/4 guitar { slur { 0/4 2/4 | break system 3/4 2/4 } | }');
    for (const part of ['score', 'tab', 'notation'] as const) {
      const view = renderScore(host(), score, { part, width: 500 });
      const slurs = view.composition.sheet.getContinuousLayout().fragments.filter(f => f.kind === 'slur');
      assert.deepEqual(slurs.map(f => f.part), part === 'score' ? ['first', 'first', 'last', 'last'] : ['first', 'last']);
      assert.ok(slurs.every(f => Number.isFinite(f.y1) && Number.isFinite(f.y2)));
      if (part !== 'score') assert.deepEqual(renderScorePart(host(), score, part).publication.diagnostics, []);
    }
  });

  QUnit.test('a bass phrase clears the triplet below its beam and the grace group above it', assert => {
    const score = parseScore(`meter 3/4 guitar {
      voice treble stem up { :h. (1/3 0/2 0/1)[grace before (0/1 0/1 0/1 0/1), brush down] | }
      voice bass stem down { slur { :8 2/4 tuplet 3:2 { :16 3/4 2/4 0/4 } :16 2/4 3/4 2/4 0/4 :q 2/4 } | }
    }`);
    const view = renderScore(host(), score, { width: 565 });
    const slurs = view.composition.sheet.getContinuousLayout().fragments.filter(f => f.kind === 'slur');
    const written = slurs.find(f => f.above);
    const numeral = view.composition.notes[0][0].flat().find(note => note.getTuplet())!.getTuplet()!.getBoundingBox();
    assert.ok(Math.max(written.y1, written.y2) < numeral.y, 'both ends and the upward arch clear the numeral');
    assert.ok(slurs.some(f => !f.above), 'the TAB slur stays below the frets');
    assert.deepEqual(view.diagnostics, []);
  });

  QUnit.test('fretted grace chords keep their strings, capo and single playback onset', assert => {
    const input = 'meter 1/4 guitar { capo 2 0/1[grace before ((0/1 1/2) 2/3)] | }';
    const score = parseScore(input);
    for (const part of ['score', 'tab', 'notation'] as const) {
      const target = host(), view = renderScore(target, score, { part });
      const grace = view.score.measures[0].voices[0].events[0].grace;
      assert.deepEqual(grace.positions, [[{ str: 1, fret: 0 }, { str: 2, fret: 1 }], [{ str: 3, fret: 2 }]]);
      assert.deepEqual(scorePerformance(view.score, 60).events.map(event => event.notes.map(n => n.pitch)),
        [[66, 62], [59], [66]]);
      const svg = part === 'score' ? target.querySelector('svg') : renderScorePart(host(), score, part).publication.pages[0].svg;
      assert.equal(svg.querySelectorAll('.vf-tabnote .vf-tabnote').length, part === 'notation' ? 0 : 2);
    }
    const tabOnly = parseScore(input.replace('capo 2', 'view tab capo 2'));
    assert.deepEqual(renderScore(host(), tabOnly).diagnostics, []);
    assert.throws(() => renderScore(host(), parseScore(input.replace('1/2', '2/1'))), /each string once/);
  });

  QUnit.test('grace fingerings and both voices’ harmony survive guitar part extraction', assert => {
    const source = `meter 2/4 guitar {
      voice top stem up { :q (1/3 0/2 0/1)[symbol "E", frame (x x x 1 0 0),
        grace before ((0/1[finger i above] 0/2) 0/1[finger a above] 0/1[finger m above] 0/1[finger i above])] 0/1 | }
      voice bass stem down { :q 2/4 (3/4 2/3 1/2)[symbol "F", brush down] | }
    }`;
    const score = parseScore(source);
    const plain = renderScore(host(), parseScore(source.replace(/\[finger [ima] above\]/g, '')));
    for (const part of ['score', 'notation', 'tab'] as const) {
      const target = host(), view = renderScore(target, score, { width: 570, part });
      assert.deepEqual(view.diagnostics, []);
      assert.deepEqual(performance(view.score), performance(plain.score), 'fingerings preserve the grace chord and its attacks');
      const svg = part === 'score' ? target.querySelector('svg') : renderScorePart(host(), score, part).publication.pages[0].svg;
      const cells = [...svg.querySelectorAll('text')];
      const fingerings = cells.filter(cell => /^[iam]$/.test(cell.textContent));
      assert.deepEqual(fingerings.map(f => f.textContent).join(''), part === 'score' ? 'iamiiami' : 'iami');
      assert.ok(fingerings.slice(1, 4).every((f, i) => f.getBoundingClientRect().left > fingerings[i].getBoundingClientRect().right),
        'adjacent grace letters retain horizontal clearance');
      for (const chord of ['E', 'F']) {
        const marks = cells.filter(c => c.textContent === chord && c.closest('.vf-stavenote,.vf-tabnote'));
        assert.equal(marks.length, 1, 'one chord symbol for the attack');
      }
    }
    assert.throws(() => parseScore(source.replace('[finger a above]', '[accent]')), /finger on the grace head/);
  });

  QUnit.test('piano aligns hands, sustains a tied bass, and prints the correct fingering and sign', assert => {
    const input = 'meter 2/4 piano { upper { times 2 { (Fn4[finger 2, showSign] A4[finger 4 right]) G4[accent] | } } lower { :h C3 | C3[tie] | } }';
    const score = parseScore(input);
    const old = parseScore('piano time=2/4\nnotes (Fn/4[f2].A/4[f4:r]) G/4[>] | (Fn/4[f2].A/4[f4:r]) G/4[>] |\nvoice hand=left\nnotes :h C/3 | TC/3 |', { language: 1 });
    for (const width of [655, 240]) {
      const a = renderScore(host(), old, { width }), b = renderScore(host(), score, { width });
      assert.deepEqual(performance(b.score), performance(old));
      assert.deepEqual(b.composition.sheet.getRows().length, a.composition.sheet.getRows().length);
      const xs = view => view.navigation.events.map(e => Math.round(view.composition.getNote(e.id).getAbsoluteX()));
      assert.deepEqual(xs(a), xs(b), 'matching beat positions through reflow');
      const events = b.navigation.events.filter(e => e.staff === 'right' && e.onset === '0/1');
      assert.notEqual(events[0].source, events[1].source);
      assert.deepEqual(b.rangeFor(events[0].id,input), b.rangeFor(events[1].id,input));
    }
    for (const part of ['notation','right','left'] as const) {
      const page = renderScorePart(host(), score, part).publication.pages[0].svg;
      const heads = [...page.querySelectorAll('.vf-notehead')].map(e => e.textContent);
      assert.equal(heads.filter(t => t.includes('\uE261')).length, part === 'left' ? 0 : 2);
      assert.equal([...page.querySelectorAll('.vf-stavenote text')].filter(e => e.textContent === '4').length, part === 'left' ? 0 : 2);
      assert.equal(scoreSurfaces.get(page).read().size, part === 'left' ? 2 : part === 'right' ? 4 : 6);
    }
  });

  QUnit.test('a four-string instrument and its player share the short opening measure', assert => {
    const legacy = parseScore('tabstave time=2/4 pickup=1/8 strings=4 tuning=G/5,D/5,A/4,E/4\nnotes :8 0/4 | :q 2/3 0/2 |', { language: 1 });
    const input = 'meter 2/4 pickup 1/8 guitar { tuning (G5 D5 A4 E4) view tab :8 0/4 | :q 2/3 0/2 | }';
    const score = parseScore(input);
    const screen = renderScore(host(), score);
    assert.deepEqual(screen.score.measures.map(m => m.span), ['1/8','1/2']);
    assert.deepEqual(performance(screen.score), performance(legacy));
    assert.equal(screen.score.measures[0].state.strings, 4);
    assert.ok(screen.navigation.events.every(e => e.staff === 'tab'));
    assert.equal(renderScorePart(host(), score, 'tab').publication.diagnostics.length, 0);
    assert.throws(() => parseScore(input.replace('pickup 1/8', 'pickup 2/4')), /shorter/);
    assert.throws(() => parseScore(input.replace('0/4 |', '0/4 0/4 |')), /crosses/);
  });

  QUnit.test('two guitar voices keep their clocks and tie reordered chord heads by string', assert => {
    const before = parseScore('tabstave notation=true time=2/4\nnotes :h (1/2.2/3) | T(2/3.1/2) |\nvoice\nnotes :q 3-1/5 | 0-2/5 |', { language: 1 });
    const source = 'meter 2/4 guitar { voice top { :h (1/2 2/3) | (2/3[tie] 1/2[tie]) | } voice bass { 3/5 1/5 | 0/5 2/5 | } }';
    const after = parseScore(source);
    for (const width of [620, 230]) {
      const screen = renderScore(host(), after, { width });
      assert.deepEqual(performance(screen.score), performance(before));
      assert.deepEqual(screen.score.ties.map(t => [t.fromHead, t.toHead]), [[1,0],[0,1]]);
      assert.equal(screen.score.measures[0].voices[0].span, '1/2');
      const region = screen.navigation.events.find(e => e.staff === 'tab');
      assert.equal(source.slice(screen.rangeFor(region.id, source).start, screen.rangeFor(region.id, source).end), '(1/2 2/3)');
    }
    const bass = renderScorePart(host(), after, 'tab', { voice: 2 });
    assert.equal(bass.publication.diagnostics.length, 0);
    assert.equal(scoreSurfaces.get(bass.publication.pages[0].svg).read().size, 4);
  });

  QUnit.test('tuplets, lyrics, repeat endings and kit identities survive independent composition', assert => {
    const source = 'meter 2/4 staff { volta 2 { :8 tuplet 3:2 { C4[lyric "riv" hyphen] D4[lyric "er"] E4 } :q F4 | } ending 1 { :h G4 | } ending 2 { :h C4 | } } drums { times 3 { (kick hat) snare | } }';
    const score = parseScore(source);
    const root = host(), melody = renderScore(root, score);
    const notes = melody.score.measures[0].voices[0].events;
    assert.deepEqual(notes.map(e => e.onset), ['0/1','1/12','1/6','1/4']);
    assert.ok(root.textContent.includes('riv'));
    assert.deepEqual(melody.score.spans.map(s => s.kind === 'volta' && [s.label,s.firstBar,s.lastBar]), [['1.',2,2],['2.',3,3]]);
    assert.equal(renderScorePart(host(), score, 'notation').publication.diagnostics.length, 0);
    const kit = renderScore(host(), score, { partIndex: 1 });
    assert.deepEqual(kit.score.measures[0].voices[0].events[0].heads.map(h => h.drum), ['kick','hat']);
    assert.ok(performance(kit.score).every(e => e[2].length === 0), 'kit hits retain unpitched playback');
  });

  QUnit.test('editable embeds preserve source revisions and select invalid v2 text', assert => {
    const root = host();
    root.setAttribute('data-editor','true');
    root.textContent = 'pattern riff { :h 0/1 } guitar { times 2 { use riff } | }';
    const embed = new Div(root);
    try {
      const revision = embed.getScore();
      const sourceID = embed.getReadingEvents()[0].id;
      const input = root.querySelector('textarea');
      assert.ok(embed.selectSource(sourceID, revision));
      assert.equal(input.value.slice(input.selectionStart, input.selectionEnd), '0/1');
      input.value = 'guitar { use missing }';
      embed.run();
      assert.ok(embed.selectError());
      assert.equal(input.value.slice(input.selectionStart, input.selectionEnd), 'missing');
      assert.notOk(embed.selectSource(sourceID, revision));
      input.value = 'guitar { :w 3/1 | }';
      embed.run();
      assert.ok(embed.getScore());
      assert.notOk(embed.selectSource(sourceID, revision));
    } finally { embed.dispose(); }
  });

  QUnit.test('local meters engrave, print and play on independent instrument clocks', assert => {
    const source = 'staff { meter 2/4 :h C4 | meter 3/8 :8 D4 E4 F4 | } '
      + 'guitar { view tab meter 3/4 :h. 0/6 | 3/6 | }';
    const parts = parseScore(source);
    for (const renderer of ['svg','canvas'] as const) {
      const views = parts.parts.map((_,partIndex) => renderScore(host(), parts, { partIndex, renderer }));
      const [melody, guitar] = views;
      const signatures = views.map(view => view.composition.staves.map(([staff]) =>
        (staff.getModifiers(undefined, TimeSignature.CATEGORY) as TimeSignature[]).map(mark => mark.getTimeSpec())));
      assert.deepEqual(signatures, [[['2/4'],['3/8']], [['3/4'],[]]]);
      const changed = melody.score.measures[1].state.timeRange;
      assert.equal(source.slice(changed.start, changed.end), '3/8');
      assert.deepEqual(scorePerformance(melody.score, 60).events.map(e => e.time), [0,2,2.5,3]);
      assert.deepEqual(scorePerformance(guitar.score, 60).events.map(e => e.time), [0,3]);
      assert.equal(scorePerformance(guitar.score, 60).duration, 6);
    }
    const print = renderScorePart(host(), parts, 'tab', { partIndex: 1 });
    assert.equal(print.publication.pages[0].svg.querySelectorAll('.vf-timesignature').length, 1);
    assert.equal(print.score.measures[0].state.meter, '3/4');
    assert.deepEqual(print.publication.diagnostics, []);
  });

  QUnit.test('a multi-part editor engraves both parts, selects their sources and plays the last sustain', async assert => {
    const root = host(), source = 'staff { meter 1/4 C4 | } staff { meter 4/4 :w G3 | }';
    const notes: number[] = [];
    let clock = 0, stoppedAt = 0, bothAnimated = false;
    let done: () => void;
    const stopped = new Promise<void>(resolve => { done = resolve; });
    root.setAttribute('data-editor', 'true');
    root.textContent = source;
    const editor = new Div(root, { player: true, playback: { open: () => ({
      get currentTime() { return clock; },
      playNote(note) { notes.push(note.pitch); },
      stop() { stoppedAt = clock; done(); },
    }) } });
    try {
      const surfaces = [...root.querySelectorAll<SVGSVGElement>('svg')].filter(svg => scoreSurfaces.has(svg));
      assert.equal(surfaces.length, 2);
      assert.strictEqual(scoreSurfaces.get(surfaces[0]).score, editor.getScore());
      assert.equal(scoreSurfaces.get(surfaces[1]).score.measures[0].state.meter, '4/4');
      assert.equal(root.querySelectorAll('button[aria-label="Play"]').length, 1);
      const reading = editor.getReadingEvents();
      assert.equal(reading.length, 2);
      assert.ok(editor.selectSource(reading[1].id, editor.getScore()));
      const textarea = root.querySelector('textarea');
      assert.equal(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd), 'G3');
      root.querySelector<HTMLButtonElement>('button[aria-label="Play"]').click();
      // Advance the plugin clock by a fixed musical step and let both score overlays paint.
      const tick = window.setInterval(() => {
        clock += clock < 0.3 ? 0.025 : 0.125;
        bothAnimated ||= surfaces.every(surface => !!surface.querySelector('.vextab-playback-ink'));
      }, 10);
      try { await stopped; } finally { window.clearInterval(tick); }
      assert.deepEqual(notes.sort((a,b) => a-b), [55,60]);
      assert.ok(bothAnimated, 'every displayed part animates on the same clock');
      assert.ok(stoppedAt >= 2, 'the four-beat instrument sustains after the first part ends');
    } finally { editor.dispose(); }
    const selected = host();
    selected.textContent = source;
    const solo = new Div(selected, { partIndex: 1 });
    try { assert.equal(solo.getReadingEvents().length, 1); assert.equal(solo.getScore().measures[0].state.meter, '4/4'); }
    finally { solo.dispose(); }
  });

  QUnit.test('the public player sends all simultaneous instruments to an injected plugin', async assert => {
    const input = 'meter 1/4 staff { C4 | } piano { upper { E4 | } lower { C3 | } }';
    const score = parseScore(input);
    const pitches: number[] = [];
    const player = new Player(score, { controls:host(), playback:{ open:() => ({
      playNote(note) { pitches.push(note.pitch); }, stop() {},
    }) } });
    try { await player.play(); }
    finally { player.dispose(); }
    assert.deepEqual(pitches.sort((a,b) => a-b), [48,60,64]);
  });
});
