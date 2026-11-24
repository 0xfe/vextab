// Exercise the same native score as a responsive SVG and an independently rebuilt publication part.
export function nativeControls() {
  const VF = window.VexFlow;
  const note = (id, key, duration) => ({ id, note: { keys: [key], duration } });
  const quarters = (a, b) => ({ voices: [{ notes: [a, b] }] });
  const measures = [
    { voices: [{ notes: [note('before', 'g/4', 'q'), { change: { clef: 'bass', key: 'G' } },
      { id: 'after', note: { keys: ['g/3'], duration: 'q', clef: 'bass' } }] }] },
    { time: '6/8', key: 'C', clef: 'treble', voices: [
      { stem: 'down', notes: ['B4/h/r.[id="hidden"]', note('lower', 'f/4', '8')] },
      { stem: 'up', notes: ['C5/q, D5/q, E5/8', note('upper', 'g/5', '8')] },
    ] },
    { time: '2/4', ...quarters(note('a', 'c/5', 'q'), note('b', 'd/5', 'q')) },
    quarters(note('c', 'e/5', 'q'), note('d', 'f/5', 'q')),
  ];
  const spec = {
    sheet: { x: 12, y: 14, width: 720, rowGap: 36 },
    staves: [{ id: 'solo', time: '2/4', measures }],
    continuous: { boundaries: [{ measure: 4, breakBefore: 'force' }], spans: [
      { kind: 'slur', id: 'phrase1', from: 'a', to: 'c', side: 'above' },
      { kind: 'slur', id: 'phrase2', from: 'b', to: 'd', side: 'below' },
    ] },
  };
  // The rest still has its written dotted-half spelling. Change elapsed ticks before each new voice counts them.
  function hiddenRest(options, tickable) {
    if (options.id !== 'hidden') return;
    tickable.setDuration(new VF.Fraction(5, 8));
    tickable.setStyle({ fillStyle: 'transparent', strokeStyle: 'transparent' });
  }
  const host = document.querySelector('main');
  const ctx = new VF.SVGContext(host);
  ctx.resize(750, 300);
  const factory = new VF.Factory({ renderer: { elementId: null, width: 750, height: 300 } }).setContext(ctx);
  const easy = factory.EasyScore();
  easy.addCommitHook(hiddenRest);
  const score = easy.compose(spec);
  factory.draw();
  const screenX = id => score.getNote(id).checkTickContext().getX();
  const spans = fragments => fragments.map(({ id, part }) => id + '/' + part).sort();
  const changes = score.notes[0][0][0].map(n => n.getCategory());
  const result = new VF.Publication(spec).render(document.querySelector('aside'), {
    staves: ['solo'], systemBreaks: [4], noteHooks: [hiddenRest], paper: 'A4', staffSize: 7,
  });
  const page = result.pages[0];
  const meta = JSON.parse(page.svg.querySelector('metadata').textContent);
  // Compare the actual printed notehead centres in the independently formatted SVG.
  function printedX(id) {
    const g = page.svg.querySelector('[data-vf-id="vf-' + id + '"] .vf-notehead');
    const r = g.getBoundingClientRect();
    return r.left + r.width / 2;
  }
  const hidden = meta.events.find(e => e.id === 'hidden');
  return {
    version: VF.BUILD.VERSION, changes,
    screenX: [screenX('lower'), screenX('upper')], printX: [printedX('lower'), printedX('upper')],
    hiddenTicks: hidden.ticks, rest: hidden.rest,
    written: score.getNote('hidden').getDuration(), dots: score.getNote('hidden').getModifiersByType(VF.Dot.CATEGORY).length,
    screenSpans: spans(score.sheet.getContinuousLayout().fragments), printedSpans: spans(meta.spans),
    systems: result.pages.flatMap(p => p.systems.map(s => s.measures)), diagnostics: result.diagnostics,
    printedChanges: [...page.svg.querySelectorAll('text')].filter(t => {
      const r = t.getBoundingClientRect();
      const start = page.svg.querySelector('[data-vf-id="vf-before"] .vf-notehead').getBoundingClientRect();
      return r.left > start.right && r.right < printedX('after') && Math.abs(r.top - start.top) < 45;
    }).map(t => t.textContent.codePointAt(0).toString(16)),
    html: result.toPrintHTML(window.faces),
  };
}
