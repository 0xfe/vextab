# Importer qualification

The optional `vextab-import` package converts a score into editable VexTab text. The `/musicxml` and `/lilypond` entries are synchronous. The `/mxl` entry is asynchronous and also reads the ZIP container. Applications can load one format on demand in a worker, then pass the returned text to their own VexTab host. [Package API](../../importer/README.md)

## What the repertoire verifies

| Complete source | Written comparison | Performed comparison |
| --- | --- | --- |
| *Echigo-Jishi*, Finale v27 for Mac, MusicXML 4.0 | All 47 bars, 169 notes and rests. The 88 nonempty source lyric texts include a Japanese syllable on a rest. Plain XML and the published MXL produce identical notation. | All 163 pitches, attacks and releases agree with the independently typeset Mutopia MIDI. |
| Bach, BWV 269, MuseScore 2.1, MusicXML 3.0 | All four SATB voices, 24 bars each, including the pickup and written repeats. | All 302 sounding events match the source itinerary. The independent Humdrum edition ties two alto figures that the MusicXML edition rearticulates. |
| Sor, Op. 35 No. 22, LilyPond 2.16.1 | All three guitar voices in 48 written bars. Source fingerings and explicit string choices survive into paired notation and TAB. | 80 bar visits and 692 attacks and releases. |
| Bach, BWV 999, LilyPond 2.16.1 | All 43 bars of the held-out Mutopia guitar transcription. | All 509 attacks and releases. |
| Joplin, *Maple Leaf Rag*, LilyPond 2.14.2 | 85 written bars in the print score and 145 in the unfolded MIDI score. The left and right hands retain their staff changes. | All 2,566 notes in the published MIDI, including ties into the second ending. |

The Chrome acceptance test opens the complete song and Sor study, edits an opening pitch, plays the edited first beat through the public player, and prints every bar of the part. It checks both occurrences of ツ in the song, one on a note and one on a rest. The full-score reference tests compare every event independently of this editor test. [MusicXML editions and independent references](MUSICXML.md) · [LilyPond editions, licenses and native references](lilypond/README.md) · [Browser proof](browser.mjs)

## Which scores work

The [corpus matrix](coverage.md) gives strict and partial results for every named selection, with overlapping feature counts and a separate count for intentionally excluded procedural music. Additional feature-isolation tests exercise one construct at a time. The corpus is a list of tested editions, not a statistical estimate for other music.

| Source profile | Qualified evidence and boundaries |
| --- | --- |
| MusicXML 4.0 | Partwise and timewise measured scores, voices, pickups, tuplets, expression, lyrics, percussion, TAB and repeats have targeted cases. Files from the MuseScore and MusicXML regression suites include both successful imports and located failures. |
| MusicXML 3.0 and 3.1 | The complete 3.0 Bach chorale exercises partial measures around a repeat. The 3.1 checks include invisible rests and a Finale v25 soprano passage. Results apply to the named editions. |
| Compressed MXL | Stored and deflated members, rootfile selection, encoding, lengths and CRCs are checked. The importer verifies the selected member before returning editable text. |
| LilyPond | The static profile covers selected 2.26 and 2.24 fixtures and the named historical editions above. Native 2.26.0 supplies reference output for the older files. Arbitrary Scheme expressions, procedural music and engraving callbacks are outside the profile. |
| VexTab output | Standard starts at 6.2.3, extended at 6.3.0 and expressive at 6.4.0. A document using the newer counted-repeat form, rest-anchored verses or branch-dependent head ties requires 6.5.0. The result reports the version and any large-capacity requirement. |

**Known losses.** Strict mode fails at the first unsupported construct. Partial mode can keep measured music and locate omitted or approximated engraving. Examples include styled markup, a flattened secondary lyric elision, and a Sor open-string fingering that conflicts with the explicitly written string and pitch. Unresolved timing, inconsistent string/fret/pitch data and missing percussion playback identity still fail. Haydn’s first and second movements work as explicit selections. Movement I gives all four parts the same 247-bar itinerary, including when the caller selects just the cello and the ending brackets appear only on violin I. The complete four-movement archive stops at the third movement’s Fine/D.C. navigation. The held-out Schumann song stops at conflicting written and elapsed rhythm in bar 26. [Expressive fixtures and boundaries](../211/README.md) · [Pinned MuseScore and Finale exports](../210/exporters.json)

## Reproduce

Use the Node version in the root `.nvmrc`, Python 3 and Chrome. Set `CHROME_BIN` for a nonstandard Chrome installation. The held-out MusicXML check fetches pinned originals and verifies cached bytes before use.

~~~sh
npm ci
npm ci --prefix importer --ignore-scripts
npm run build-dev
npm test --prefix importer
python3 issues/210/fetch-exporters.py
node issues/212/musicxml-full.mjs --held-out
node issues/212/lilypond/check.mjs
node issues/212/lilypond/coverage.mjs
node issues/212/generated.mjs
node issues/212/matrix.mjs
node issues/212/browser.mjs
node issues/207/consumer.mjs
~~~

The generated check builds 64 pairs of five-bar melodies, compares each reader with an integer-grid pitch and time oracle, truncates both sources, and checks the public limits. CI also installs the tarball on Node 22.18.0, checks strict TypeScript declarations, reparses both modes and inspects the shipped VexTab host’s production source maps. Build with `npm run build -- --json /tmp/vextab-webpack.json`, pack and unpack the host, then run `node issues/212/host-package.mjs /path/to/unpacked/package /tmp/vextab-webpack.json` to verify the shipped bundles against the complete module graph.
