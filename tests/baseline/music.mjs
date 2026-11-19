// Musical contracts for the first VexTab 5 comparison, measured in the browser.
const tabTriplet = 'options tab-stems=true\ntabstave notation=false\nnotes :8 1-2-3/1 ^3^';
const alignedNotes = 'tabstave notation=true time=4/4\nnotes 4-5-6/3 10/4';

// Each example uses standard tuning, one voice and bar one in 4/4.
// "released" records a specific known defect. Unrelated failures must still fail CI.
export const cases = [
  {
    id: 'tab-triplet', issue: 131, source: tabTriplet, probe: 'tab-ticks',
    expectation: 'Three eighths occupy one quarter even when the staff is hidden.',
    wanted: ['4096/3', '4096/3', '4096/3'], released: ['2048/1', '2048/1', '2048/1'],
    picture: true,
  },
  {
    id: 'paired-triplet', source: tabTriplet.replace('notation=false', 'notation=true'), probe: 'tab-ticks',
    expectation: 'With notation visible the same three tab attacks still occupy one quarter.',
    wanted: ['4096/3', '4096/3', '4096/3'], picture: true,
  },
  {
    id: 'mixed-tuplet', issue: 100, source: 'stave\nnotes :q C/4 :8 D/4 ^3,2^', probe: 'staff-ticks',
    expectation: 'The long and short attacks share one quarter in a two-to-one proportion.',
    wanted: ['8192/3', '4096/3'], released: ['4096/1', '2048/1'],
  },
  {
    id: 'dotted-slash', issue: 62, source: 'stave\nnotes :qSd X/5', probe: 'staff-ticks',
    expectation: 'The dotted quarter slash renders and lasts one and a half beats.',
    wanted: ['6144/1'], released: 'invalid qsd duration',
  },
  {
    id: 'second-draw', source: 'tabstave notation=true\nnotes :q 5/2 |', probe: 'redraw',
    expectation: 'The second draw still has one tab voice, one staff voice and one player group.',
    wanted: [1, 1, 1], released: [2, 2, 2],
  },
  {
    id: 'g-natural', issue: 164, source: 'tabstave notation=true key=A\nnotes :q (2/2.0/3.2/4.0/5)', probe: 'natural',
    expectation: 'A single natural is attached to G and drawn at that head in the A-major chord.',
    wanted: { key: 'g/4', glyphs: 1, offset: 0 }, picture: true,
  },
  {
    id: 'aligned-attacks', issue: 99, source: alignedNotes, probe: 'alignment',
    expectation: 'All four attacks line up between the staff and tab.', wanted: [0, 0, 0, 0],
  },
  {
    id: 'trailing-bar', issue: 99, source: alignedNotes + ' |', probe: 'alignment',
    expectation: 'All four attacks still line up after adding a final bar.', wanted: [0, 0, 0, 0],
  },
  {
    id: 'repeat-at-left', issue: 163, source: 'tabstave\nnotes =|: 0/4 2/3', probe: 'visual',
    expectation: 'Review the left edge and repeat dots against the historical report.', picture: true,
  },
];

// Playwright serializes this function into a page containing the production bundle.
// Read the public parse result, then inspect the actual objects and SVG used on screen.
export function measureScore({ source, probe }) {
  const { Artist, Vex, VexTab } = window.vextab;
  const host = document.querySelector('#score');
  host.replaceChildren();
  const artist = new Artist(10, 10, 600);
  const parser = new VexTab(artist);
  const renderer = new Vex.Flow.Renderer(host, Vex.Flow.Renderer.Backends.SVG);
  try {
    const elements = parser.parse(source);
    if (!Array.isArray(elements) || !elements.some(entry => ['stave', 'tabstave'].includes(entry.element))) {
      throw new Error('Expected parse() to return stave elements.');
    }
    artist.render(renderer);
  } catch (error) {
    if (probe === 'staff-ticks' && /Invalid note initialization object:.*"duration":"qsd"/.test(error.message)) {
      return 'invalid qsd duration';
    }
    throw error;
  }
  const stave = artist.staves[0];
  switch (probe) {
    case 'tab-ticks':
    case 'staff-ticks': {
      const notes = probe === 'tab-ticks' ? stave.tab_notes : stave.note_notes;
      return notes.map(note => note.getTicks().clone().simplify().toString());
    }
    case 'redraw':
      artist.draw(renderer);
      return [stave.tab_voices.length, stave.note_voices.length, artist.player_voices.length];
    case 'natural': {
      const chord = stave.note_notes[0];
      const modifier = chord.getModifiers().find(mark => mark.type === 'n');
      const index = modifier.getIndex();
      // SMuFL U+E261 is the natural sign. Compare its SVG baseline with the head.
      const glyphs = [...host.querySelectorAll('text')].filter(node => node.textContent === '\uE261');
      return { key: chord.getKeys()[index], glyphs: glyphs.length, offset: Number(glyphs[0]?.getAttribute('y')) - chord.getYs()[index] };
    }
    case 'alignment':
      return stave.note_notes.map((note, i) => note.getAbsoluteX() - stave.tab_notes[i].getAbsoluteX());
    case 'visual':
      return 'manual review';
    default:
      throw new Error('Unknown score probe: ' + probe);
  }
}

// Measure warm parse + SVG render with a new Artist on every sample.
// Repeat the same short phrase in 16 two-staff systems to make a scalable long study.
export function timeScores() {
  const { Artist, Vex, VexTab } = window.vextab;
  const host = document.querySelector('#score');
  const phrase = 'tabstave notation=true time=4/4\nnotes :8 1-2-3-4/3 4-3-2-1/2 |';
  const timings = {};
  for (const systems of [1, 16]) {
    const source = Array(systems).fill(phrase).join('\n');
    const samples = [];
    for (let i = 0; i < 11; i++) {
      host.replaceChildren();
      const start = performance.now();
      const artist = new Artist(10, 10, 600);
      new VexTab(artist).parse(source);
      artist.render(new Vex.Flow.Renderer(host, Vex.Flow.Renderer.Backends.SVG));
      host.querySelector('svg').getBoundingClientRect();
      if (i > 0) samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    timings[systems] = Number(((samples[4] + samples[5]) / 2).toFixed(2));
  }
  return timings;
}
