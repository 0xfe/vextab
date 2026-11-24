# Complete orchestral and piano scores

These opt-in tests import the publishers’ uncut MusicXML archives, rebuild the plain XML independently, and require both public import paths to produce identical VexTab. They parse the generated score, compare each visible measured head and rest to the source, and run the production player. All five works use partial mode, the expressive target and large capacity. [Input manifest with URLs, checksums and credits](sources.json)

| Complete work | Parts × written measures | Written heads + rests | Player attacks | Independent coverage |
| --- | ---: | ---: | ---: | --- |
| Bach, *Brandenburg Concerto No. 3*, BWV 1048, I | 11 × 137 | 12,434 + 1,496 | 12,453 | Every written tuple. The player count includes ornament realization. |
| Bach, *Brandenburg Concerto No. 3*, BWV 1048, III | 11 × 48 | 7,457 + 269 | 14,912 | Every written tuple and every performed pitch, onset and release through both repeats, including the octave-transposing violone. |
| Schubert, *Gretchen am Spinnrade*, D 118 | 2 × 120 | 2,367 + 332 | 2,287 | Every written and performed tuple. Five voice lanes across the singer and both piano staves include ties that transfer between voices. |
| Schubert, *Der Erlkönig*, D 328 | 2 × 148 | 2,888 + 304 | 2,882 | Every written tuple. The source also has five grace notes, 2,180 time-modified notes, 318 nonempty lyric texts and a two-staff piano part. The edition names the first part “Clarinet in C”. |
| Beethoven, Symphony No. 5, Op. 67, I | 18 × 502 | 10,029 + 5,159 | 10,946 | Every written pitch, stem and note velocity. All 10,922 performed principals match across the 626 visits of each part, including the ten-quarter oboe cadenza in bar 268. |

The written oracle compares source part, displayed staff, source voice, written measure, exact onset, elapsed head or rest duration, and pitch spelling. Python's ElementTree reads the XML, and exact fractions account for backups, forwards and chords. Grace notes have a separate performed-time model and are excluded from the written tuple count. For three works, the oracle joins sounding ties, applies the source transposition, unfolds repeats and integrates the source tempos to the nearest microsecond. In Beethoven, the test checks the alternating pitches of six timpani trills and compares the onset, pitch and release of each principal. It also checks 682 written velocity percentages and the resulting 941 played note velocities after repeats and ties. The player independently traverses the reparsed VexTab. [Oracle](reference.py) · [Assertions](check.mjs)

## Run

From the repository root, use the Node version in `.nvmrc` and Python 3. The reference reader uses the Python standard library.

~~~sh
npm ci
npm ci --prefix importer
npm run build-dev
npm --prefix importer run build
node issues/212/complex-musicxml/check.mjs
node issues/212/complex-musicxml/browser.mjs
~~~

The first run downloads five source archives to `build/importer-complex-musicxml/` and verifies each archive and rootfile checksum. Add `--offline` to the check command to use the verified cache. Each successful work gets an editable `<file>.vextab` beside the original MXL, its extracted plain XML and the reference observations.

The browser command uses Chrome and writes a white-background preview PNG for each case in the same directory. It checks the complete Brandenburg I and III first violin parts, both *Gretchen* parts, the *Erlkönig* piano and Beethoven’s first oboe on screen and in print. It also opens all eleven instruments in the Brandenburg I conductor view for written bars 1–8 and prints the first violin across those bars. Print coverage is checked from the SVG measure metadata on every page. [Browser checks](browser.mjs)

The selected print editions passed without rendering diagnostics. The Beethoven oboe shows 783 noteheads on each surface and covers all 502 written bars on four printed pages. The source’s cue-size cadenza notes retain their measured durations, with a warning for their omitted engraving size. The current reader also reports unsupported tremolos and wavy-line continuations. The projection may omit typography, secondary beam levels and markings such as unsupported articulations or wedges without an attack at their source offset. The returned warnings identify those locations.

## Credits

The Bach and Beethoven editions come from Mark Gotham and contributors to *Hauptstimme / OpenScore Orchestra*. The scores carry a CC0 1.0 dedication and the analytical annotations carry CC BY-SA. The Schubert transcriptions come from the OpenScore Lieder Corpus under CC0 1.0. The *Gretchen* file credits transcriber bradleykunda and identifies IMSLP edition 13971. The *Erlkönig* file identifies IMSLP edition 15041. [Hauptstimme rights and citation](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/README.md) · [OpenScore Lieder rights and citation](https://github.com/OpenScore/Lieder/blob/38c5db510224d9facdc4b08d741fc788cfb58ea8/README.md)
