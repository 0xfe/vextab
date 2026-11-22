# VexTab demos

Run `npm ci` and `npm start`, then open the [demo library](http://127.0.0.1:9005/guide/#studies). Each study has an edit to try. Open it in the playground to save a draft or download the score. The same demos ship offline at `dist/guide/index.html#studies`.

| Study | What to try |
| --- | --- |
| [All of Me](../guide/scores/all-of-me.vextab) | Follow Django Reinhardt’s guitar solo from its Dm7–G7 lead-in to the run in bar 17. |
| [Soleá](../guide/scores/flamenco-tab.vextab) | Compare the triplet arpeggios and bass line in paired notation and tab. |
| Compound-time picking | Move the triplet and read it in rhythmic tab. |
| A-major chord workshop | Track the natural on G and a fingering through reordered chord members. |
| Two-voice bossa | Change the upper attack while the bass holds. |
| Drop D turnaround | Move the peak of the string-three bend and follow the bass mute across rows. |
| Slow river | Edit a chord label over a dotted slash and a syllable under the bass. |
| Read the endings | Start a new row before the second ending. |
| Guitar duet for print | Switch player and paper size, then inspect the independent page. |
| Two independent editors | Edit, break, recover and resize two embeds independently. |

The [canonical VexTab files](../guide/scores/) feed the guide and its tests. The distribution includes plain-text copies in `dist/guide/scores/`. The [project index](http://127.0.0.1:9005/) also links to both playback demos, the DOM embed, and the score API example. Press **Play** at the bottom center of any guide score. The first play loads the bundled SpessaSynth worklet and SoundFont. The separate native Web Audio demo demonstrates the sample-free embed default.
