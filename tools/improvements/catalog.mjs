// Editorial chapters and reproducible exhibits for the VexTab 4 to 5 change report.
export const comparisons = [
  [
    'paired-triplet',
    'Triplets in tab and notation',
    'options tab-stems=true\ntabstave notation=true\nnotes :8 1-2-3/1 ^3^',
  ],
  ['repeat-at-left', 'A repeat at the start of a stave', 'tabstave\nnotes =|: 0/4 2/3'],
  ['g-natural', 'A natural inside an A-major chord', 'tabstave notation=true key=A\nnotes :q (2/2.0/3.2/4.0/5)'],
];
export const studies = [
  ['drop-d-turnaround', 'Drop D Turnaround'],
  ['slow-river', 'Slow River'],
  ['guitar-duet', 'Guitar duet'],
];
// Each section below supplies its own first editable example from the committed guide.
export const features = ['piano', 'drum-kit', 'score-colours', 'pre-bends', 'fingerings'];
export const topics = [
  [
    'Foundations',
    'The 4.x releases',
    [
      [
        'Browser embeds',
        'The early 4.x updates repaired automatic div rendering. Tagged snapshots preserve the browser bundle and the test suite used for each release.',
        'commit/0646fe9',
      ],
      [
        'Renderer and distribution',
        'VexTab moved to VexFlow 5.3 and began producing release downloads through GitHub Actions.',
        'commit/5db6d8b',
      ],
    ],
  ],
  [
    'Notation',
    'Reading tab and staff',
    [
      [
        'Triplet rhythm',
        'Read three evenly spaced attacks on the paired staves. The baseline tests also check the duration of each tab note with the staff hidden.',
        'tests/baseline/music.mjs',
        'paired-triplet',
      ],
      [
        'Opening repeats',
        'Compare the barline before the clef with the repeat sign before the first fret.',
        'tests/baseline/music.mjs',
        'repeat-at-left',
      ],
      [
        'Accidentals in chords',
        'The open third string sounds G natural in A major. Locate its accidental in the staff and its fret in tab.',
        'tests/baseline/music.mjs',
        'g-natural',
      ],
    ],
  ],
  [
    'Notation',
    'Writing for guitar and voice',
    [
      [
        'Drop D techniques',
        'A palm-muted bass voice supports the melody. The bend on string three leaves the other chord tone sounding.',
        'guide/scores/drop-d-turnaround.vextab',
        'drop-d-turnaround',
      ],
      [
        'Lead sheets',
        'Slow River sets chord names, a barre diagram and syllables against slash rhythm and a second voice.',
        'guide/scores/slow-river.vextab',
        'slow-river',
      ],
      [
        'Independent voices',
        'Follow the quarter-note melody and longer bass notes through the same four measures in 3/4.',
        'guide/scores/guitar-duet.vextab',
        'guitar-duet',
      ],
    ],
  ],
  [
    'Working with scores',
    'Parsing, layout and access',
    [
      [
        'Parse without a browser',
        'Read measures, voices and source ranges with the parser entry point. Diagnostics identify the source of a malformed measure.',
        'src/score/parse.ts',
      ],
      [
        'Lay out scores and parts',
        'Render a parsed score at the host width, select notation or tab, and use hit regions to locate events.',
        'src/score/layout.ts',
      ],
      [
        'Learn and embed',
        'The guide combines an editable tutorial with feature examples, studies, a developer quickstart and an API reference.',
        'guide/index.html',
      ],
    ],
  ],
  [
    'Notation',
    'Instruments and expression',
    [
      [
        'Piano grand staff',
        'The two hands share barlines and a playback timeline while keeping their own rhythms and clefs.',
        'tests/piano.ts',
        'piano',
      ],
      [
        'Drum kit',
        'Named kit hits use a percussion stave with instrument-specific positions and noteheads.',
        'tests/drums.ts',
        'drum-kit',
      ],
      [
        'Colour',
        'Give a stave a default ink and override an attack or chord label independently.',
        'docs/colors.md',
        'score-colours',
      ],
      [
        'Pre-bends and open slides',
        'Start a bend already raised, release it on the played string, or draw a slide with one open end.',
        'guide/features.html',
        'pre-bends',
      ],
      [
        'Per-head fingerings',
        'Place a finger number beside one pitch of a chord and add an accent to the following attack.',
        'guide/features.html',
        'fingerings',
      ],
      [
        'Transposition',
        'Move written pitches, guitar fingerings and playback together by a semitone interval.',
        'tests/transpose.ts',
      ],
    ],
  ],
  [
    'Working with scores',
    'Publication and language design',
    [
      [
        'Print and offline SVG',
        'Extract a voice, choose a paper size and save a printable part with outlined music and text glyphs.',
        'docs/vt5-m5.md',
        'guitar-duet',
      ],
      [
        'Grammar v2 prototype',
        'The experimental grammar and migration plan describe a possible next syntax. The current guide teaches the released grammar.',
        'docs/grammar2-plan.md',
      ],
    ],
  ],
  [
    'Working with scores',
    'Playback',
    [
      [
        'Connect a synthesizer',
        'Use the Web Audio adapter or supply a SpessaSynth host for SoundFont playback.',
        'docs/playback.md',
      ],
      [
        'Follow the performance',
        'The player overlay follows score time and highlights sounding notes at their rendered positions.',
        'src/player-overlay.ts',
      ],
    ],
  ],
];
