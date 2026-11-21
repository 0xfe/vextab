// Browser probes run against each bundle in its own document with loaded engraving fonts.
const vt = window.vextab;
const vf = vt.Vex.Flow;
const screenHost = document.querySelector('#screen');
const printHost = document.querySelector('#paper');

/** Measure the same downbeat and right barline on every rendered staff. */
function layoutGeometry(composition) {
  const rows = composition.sheet.getContinuousLayout().rows.map(row => row.measures);
  const measures = composition.staves.map((staves, i) => staves.map((stave, staff) => ({
    downbeat: composition.notes[i][staff][0][0].getAbsoluteX(),
    barline: stave.getX() + stave.getWidth(),
  })));
  return { rows, measures };
}

/** Keep exact musical ownership separate from width-dependent native IDs and SVG placement. */
function ensembleMusic(source) {
  return vt.parseScore(source).parts.map((part, index) => {
    const staff = part.staves[0];
    const voice = staff.voices[0];
    return {
      part: index, staff: staff.name, voice: voice.name,
      events: voice.events.map(event => ({
        id: event.id, bar: event.bar, at: event.at, duration: event.duration, pitch: event.heads[0].pitch,
      })),
    };
  });
}

/** Draw independently extracted staves and measure how their barlines diverge. */
function separateParts({ source, width }) {
  screenHost.replaceChildren();
  const score = vt.parseScore(source);
  return score.parts.map((part, partIndex) => {
    const host = screenHost.appendChild(document.createElement('div'));
    return layoutGeometry(vt.renderScore(host, score, { partIndex, width }).composition);
  });
}

/** Compose the same four written bars in one native sheet with shared beat positions. */
function nativeEnsemble(width) {
  screenHost.replaceChildren();
  const ctx = new vf.SVGContext(screenHost);
  const factory = new vf.Factory({ renderer: { elementId: null, width, height: 1 } }).setContext(ctx);
  const staff = (id, clef, notes, autoBeam) => ({
    id, clef, time: '4/4', measures: Array.from({ length: 4 }, () => ({ voices: [{ notes, autoBeam }] })),
  });
  const composition = factory.EasyScore().compose({
    sheet: { width: width - 20, x: 10, y: 14, rowGap: 36 }, continuous: {},
    staves: [
      staff('melody', 'treble', 'C4/8, D4/8, E4/8, F4/8, G4/8, F4/8, E4/8, D4/8', true),
      staff('bass', 'bass', 'C3/w', false),
    ],
  });
  factory.draw();
  ctx.resize(width, Math.ceil(composition.sheet.getHeight() + 20));
  const voices = composition.notes.map(staves => staves.map(voices => voices[0].map(note => ({
    keys: note.getKeys(), duration: note.getDuration(),
  }))));
  return { ...layoutGeometry(composition), voices };
}

/** Resize one live public embed twice. Reading and glyph counts detect an empty or stale surface. */
function resizeEmbed(source) {
  const host = document.querySelector('#embed');
  host.textContent = source;
  const embed = new vt.Div(host);
  try {
    return [800, 360, 800].map(width => {
      embed.setWidth(width);
      const surfaces = [...host.querySelectorAll('svg')];
      return { width, reading: embed.getReadingEvents(), parts: surfaces.map(svg =>
        [...svg.querySelectorAll('.vf-stavenote')].map(note => note.getBBox().y)) };
    });
  } finally {
    embed.dispose();
    host.replaceChildren();
  }
}

/** Capture a located refusal or an independent page with its diagnostics and visible note groups. */
function publication(score, part) {
  printHost.replaceChildren();
  try {
    const { pages, diagnostics } = vt.renderScorePart(printHost, score, part).publication;
    return { pages: pages.length, diagnostics: diagnostics.map(d => d.code),
      notes: printHost.querySelectorAll('.vf-stavenote,.vf-tabnote').length };
  } catch (error) {
    return { error: error.message, range: error.range };
  }
}

/** Read the complete rendered verse positions, source marks and musical time for the small studies. */
function study({ id, source, width, part }) {
  const model = vt.parseScore(source);
  const view = vt.renderScore(screenHost, model, { width });
  const verse = ['one', 'two', 'roll', 'to', 'sea'];
  const lyrics = [...screenHost.querySelectorAll('text')].filter(el => verse.includes(el.textContent))
    .map(el => ({ text: el.textContent, y: Number(el.getAttribute('y')) }));
  const events = model.parts[0].staves[0].voices[0].events;
  const surface = {};
  if (id === 'beam' || id === 'skip') {
    const notes = view.composition.notes[0][0][0];
    surface.drawn = notes.map(note => note.renderOptions.draw !== false);
    if (id === 'beam') {
      const beam = notes[0].getBeam();
      surface.beam = beam?.getNotes().map(note => notes.indexOf(note));
    }
  }
  const print = publication(model, part);
  if (id === 'two-lyrics') {
    print.lyrics = [...printHost.querySelectorAll('text')].map(el => el.textContent).filter(text => verse.includes(text));
  }
  return {
    surface, lyrics, marks: events[0].marks.map(mark => mark.text),
    rhythm: events.map(e => [e.kind, e.at, e.duration]),
    rows: view.composition.sheet.getContinuousLayout().rows.map(row => row.measures),
    diagnostics: view.diagnostics.map(d => d.code), print,
  };
}

/** Measure visible chord ink in SVG coordinates. A gap only has meaning on a shared row. */
function harmony({ source, labels, width, native }) {
  screenHost.replaceChildren();
  let composition, boxes;
  if (native) {
    const ctx = new vf.SVGContext(screenHost);
    const factory = new vf.Factory({ renderer: { elementId: null, width, height: 1 } }).setContext(ctx);
    composition = factory.EasyScore().compose({
      sheet: { width, measurePadding: 0 }, continuous: {},
      staves: [{ id: 'solo', time: '4/4', measures: labels.map((_, bar) => ({
        voices: [{ notes: ['c/4', 'd/4', 'e/4', 'f/4'].map((key, index) =>
          ({ id: 'n' + bar + index, note: { keys: [key], duration: 'q' } })) }],
      })) }],
    });
    const marks = labels.map((label, bar) => {
      const mark = new vf.ChordSymbol().addText(label).setReportWidth(false);
      composition.getNote(bar === 0 ? 'n03' : 'n10').addModifier(mark, 0);
      return mark;
    });
    factory.draw();
    ctx.resize(width, Math.ceil(composition.sheet.getHeight() + 30));
    boxes = marks.map(mark => document.getElementById('vf-' + mark.getAttribute('id')).getBBox());
  } else {
    composition = vt.renderScore(screenHost, vt.parseScore(source), { width }).composition;
    boxes = labels.map(label => [...screenHost.querySelectorAll('text')].find(el => el.textContent === label).getBBox());
  }
  const rows = composition.sheet.getContinuousLayout().rows.map(row => row.measures);
  const gap = rows.length === 1 ? boxes[1].x - boxes[0].x - boxes[0].width : null;
  return { width, rows, gap, ink: boxes.map(b => [b.x, b.y, b.width, b.height]) };
}

/** Time completed synchronous operations. Edits change a real attack in the public editor. */
function timedPass(source) {
  const time = action => {
    const start = performance.now();
    action();
    return performance.now() - start;
  };
  let score;
  const parse = time(() => { score = vt.parseScore(source); });
  const draw = time(() => {
    screenHost.replaceChildren();
    for (const partIndex of score.parts.keys()) {
      const target = screenHost.appendChild(document.createElement('div'));
      vt.renderScore(target, score, { width: 800, partIndex });
    }
  });
  const print = time(() => {
    printHost.replaceChildren();
    for (const partIndex of score.parts.keys()) {
      const target = printHost.appendChild(document.createElement('div'));
      vt.renderScorePart(target, score, 'notation', { partIndex });
    }
  });
  const host = document.querySelector('#embed');
  host.setAttribute('data-editor', 'true');
  host.textContent = source;
  const embed = new vt.Div(host);
  try {
    embed.setWidth(800);
    const reflow = time(() => embed.setWidth(360));
    const edited = source.replace('C4', 'B4');
    host.querySelector('textarea').value = edited;
    const edit = time(() => embed.run());
    if (embed.getScore()?.source !== edited) throw new Error('Edit did not reach the public score');
    return { parse, draw, print, reflow, edit };
  } finally {
    embed.dispose();
    host.replaceChildren();
    host.removeAttribute('data-editor');
  }
}

/** Entry points called by Playwright in the isolated release document. */
window.m0 = { ensembleMusic, separateParts, nativeEnsemble, resizeEmbed, study, harmony, timedPass };
