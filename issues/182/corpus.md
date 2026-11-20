# Grammar v2 corpus migration

Run `npm start` on the grammar development branch. Open **Guide** for lessons and **Grammar v2 sketchbook** for individual examples. Select **Empty four-string tab** or **Independent text and signs** to inspect the engraving.

| Material | Where to review it |
| --- | --- |
| Fifteen downloadable studies, including Slow River, Drop D and two-voice guitar | [Guide scores](../../guide/scores) |
| Fifteen tutorial steps, feature chapters, reference, quick start and editable examples | [Tutorial](../../doc/tutorial.html) and [guide](../../guide) |
| Manual and automatic embeds, both playback adapters and playgrounds | [Demos](../../demos), [project index](../../static/index.html) and [sketchbook](../../experiments/grammarv2/preview.html) |
| Author migration, ambiguous input and saved guide drafts | [Migration guide](../../docs/migrate-scores.md) |
| Packaged consumer, print, playback, engraving and score navigation | [Consumer test](../../scripts/test-consumer.mjs) and [browser tests](../../tests) |
| Companion site and editable website examples | [vexflow.com preview branch](https://github.com/0xfe/vexflow.com/tree/vextab-grammar-v2-preview) |

The chord tutorial now has two editors. One shows named pitches on a staff and the other shows string positions and bends. The historical showpiece contained a pull-off without a preceding note on the destination string. Its replacement keeps the fret and duration and omits that ambiguous connection.

Run `npm test` to parse the authored examples and exercise the guide and rendering in Chrome. The [corpus checker](../../scripts/check-corpus.mjs) extracts scores from the source pages and downloads. The [frozen baseline pages](../../tests/baseline/v1) supply the original scores to the historical renderer. The [Artist parser suite](../../tests/compat/artist-parser.ts), legacy API, migration and differential tests retain v1 where a comparison or backward compatibility is the assertion.

The four-string clef uses a local size correction. Track [VexFlow #373](https://github.com/vexflow/vexflow/issues/373) before removing it. The timed-text example covers independent signs and lyric placement, including adjacent signs at one beat.
