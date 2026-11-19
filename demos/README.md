# VexTab demos

Run `npm ci` and `npm start`, then open the [demo library](http://127.0.0.1:9005/guide/#demos). Each study has an edit to try. Open it in the playground to save a draft or download the score. The same demos ship offline at `dist/guide/index.html#demos`.

| Study | What to try |
| --- | --- |
| Compound-time picking | Move the triplet and read it in rhythmic tab. |
| A-major chord workshop | Track the natural on G and a fingering through reordered chord members. |
| Two-voice bossa | Change the upper attack while the bass holds. |
| Drop D turnaround | Move the peak of the string-three bend and follow the bass mute across rows. |
| Slow river | Edit a chord label over a dotted slash and a syllable under the bass. |
| Read the endings | Start a new row before the second ending. |
| Guitar duet for print | Switch player and paper size, then inspect the independent page. |
| Two independent editors | Edit, break, recover and resize two embeds independently. |

The [canonical VexTab files](../guide/scores/) feed the guide and its tests. The distribution includes plain-text copies in `dist/guide/scores/`. To run the two minimal integration demos, run `npm run build-dev` and `npm run serve`. Open the [DOM embed](http://127.0.0.1:8052/demos/div-plugin.html) or [Artist API example](http://127.0.0.1:8052/demos/api.html).
