// Editorial highlights keyed to the commit that introduced the change. Git determines the shipping release.
export const highlights = [
  [
    'c48718a',
    'Browser bundles',
    'The 4.0.2 distribution refreshed the development and production bundles for pages that embed VexTab in a div.',
  ],
  [
    '0646fe9',
    'Automatic embeds',
    'Pages can render div.vextab-auto elements when the document is ready. The release includes examples for both the div plug-in and the JavaScript API.',
  ],
  [
    '5a52761',
    'Build dependencies',
    'The release removed the grunt-release plug-in from the build and updated the dependency lockfile.',
  ],
  [
    '2400329',
    'VexFlow 5.3 and safer embeds',
    'VexTab adopted VexFlow 5.3 and updated the editor to display parse errors as plain text.',
  ],
  [
    '5db6d8b',
    'Release downloads',
    'The release workflow now publishes built bundles on GitHub, where each download belongs to a tagged version.',
  ],
  [
    '24f25ac',
    'Rhythm and barlines',
    'Tab and notation now agree on the length of triplet notes, and a repeat at the start of a stave leaves room for the first note.',
    'paired-triplet',
  ],
  [
    '1f70a17',
    'One score for screen and parts',
    'Parse a score once, then reflow it to the available width or select a part. Rendered notes point back to the text that produced them.',
    'guitar-duet',
  ],
  [
    'eb1bd03',
    'Guitar techniques and lead sheets',
    'Drop D Turnaround keeps a chord tone ringing through a bend. Slow River places chord diagrams and lyric syllables above and below a slash-rhythm part.',
    'slow-river',
  ],
  [
    'a885cf7',
    'Print and offline export',
    'Export a part as SVG with outlined glyphs so the score can travel with its music and text intact.',
  ],
  [
    '1eb83a6',
    'A new default score language',
    'Write same-string runs, name voices, and reuse patterns in grammar v2. The migration command converts older scores, and the v1 reader remains available for existing embeds.',
  ],
  [
    '0b8c78b',
    'Piano grand staff',
    'Write both hands of a piano part on a grand staff. Each hand keeps its own rhythm while barlines line up across the two staves.',
    'piano',
  ],
  [
    '4e50622',
    'Drum kit notation',
    'Name the kick, snare or hi-hat in the score. The percussion stave places each hit at its kit position with the corresponding notehead.',
    'drum-kit',
  ],
  [
    'fb097ca',
    'Transposition',
    'Transpose a passage by semitones while keeping the written pitches, guitar frets and playback in agreement.',
  ],
  [
    '36b9a58',
    'Playable guide examples',
    'Listen to editable scores through SpessaSynth while a moving cursor follows the beat and the sounding notes light up. Embeds can supply their own audio host.',
  ],
  [
    '362316a',
    'Conductor scores',
    'Combine named instruments in a single score so the conductor can read their rhythms against the same barlines.',
  ],
  [
    '2138f50',
    'Printed parts and page turns',
    'Prepare conductor and player editions from the same music, with cues and page turns chosen for the musician reading each part.',
  ],
  [
    'bad577b',
    'Four repertoire studies',
    'Follow the right hand down to the lower staff in Maple Leaf Rag, then compare how the Haydn, Handy and Sor studies use voices and markings on screen and in print.',
    'joplin-maple-leaf',
  ],
  [
    '7a4d93e',
    'Chopin’s Ballade',
    'The opening 24 bars fit into compact piano systems. The indented first system, ossia, grace chords and pedal marks follow the phrasing of the engraved example.',
    'chopin-ballade-no3',
  ],
  [
    '11b0c7e',
    'Chord-melody guitar',
    'All of Me puts the melody on top of seven playable chord grips. The diagrams above the score let the guitarist see each shape before it appears in the music.',
    'all-of-me',
  ],
  [
    'ca09839',
    'Flamenco fingering',
    'In Soleá, the right-hand fingerings show the order of the rasgueado strokes while a separate voice carries the bass.',
    'flamenco-tab',
  ],
  [
    '6210632',
    'Expressive playback',
    'Expressive performers can vary the attack, velocity and release of individual chord tones, so the fingers land slightly apart.',
  ],
  [
    '9956c23',
    'On-score controls',
    'Choose mini or large controls, change the tempo, and let the player scroll to the sounding system as a long score moves through the viewport.',
  ],
  [
    '36e8a3b',
    'An opt-in player in the tutorial',
    'The opening lessons introduce durations, chords, rests and tuplets before adding the player. The next lesson puts it to work on a sixteenth-note hammer-on.',
  ],
  [
    '75f582b',
    'Controls in a moving carousel',
    'When a carousel slides, the playback controls stay centered in the visible portion of the score.',
  ],
  [
    '3728a25',
    'Playback after browser Back',
    'After returning to a page with the Back button, Play opens a fresh audio context so the score resumes at the intended tempo.',
  ],
];

// These npm patches lack tags on master. Only 4.0.4 has a release build in the reported ancestry.
export const npmPatches = [
  { tag: '4.0.4', hash: '3a5e00d858ae98934ba545f9bef5eb923e17e402', date: '2026-01-18' },
  {
    tag: '4.0.5',
    date: '2026-01-18',
    note: 'This npm patch refreshed the distributed bundles and included their license notices. Its release commit is on a separate branch.',
  },
];
