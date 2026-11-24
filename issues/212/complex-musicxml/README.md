# Complete orchestral and piano scores

These opt-in tests import the publishers’ uncut MusicXML archives, rebuild the plain XML independently, and require both public import paths to produce identical VexTab. They parse the generated score, compare each visible measured head and rest to the source, and run the production player. All four successful works use partial mode, the expressive target and large capacity. [Input manifest with URLs, checksums and credits](sources.json)

| Complete work | Parts × written measures | Written heads + rests | Player attacks | Independent coverage |
| --- | ---: | ---: | ---: | --- |
| Bach, *Brandenburg Concerto No. 3*, BWV 1048, I | 11 × 137 | 12,434 + 1,496 | 12,453 | Every written tuple. The player count includes ornament realization. |
| Bach, *Brandenburg Concerto No. 3*, BWV 1048, III | 11 × 48 | 7,457 + 269 | 14,912 | Every written tuple and every performed pitch, onset and release through both repeats, including the octave-transposing violone. |
| Schubert, *Gretchen am Spinnrade*, D 118 | 2 × 120 | 2,367 + 332 | 2,287 | Every written and performed tuple. Five voice lanes across the singer and both piano staves include ties that transfer between voices. |
| Schubert, *Der Erlkönig*, D 328 | 2 × 148 | 2,888 + 304 | 2,882 | Every written tuple. The source also has five grace notes, 2,180 time-modified notes, 318 nonempty lyric texts and a two-staff piano part. The edition names the first part “Clarinet in C”. |
| Beethoven, Symphony No. 5, Op. 67, I | 18 × 502 | 15,261 source note elements | — | Both input formats return a located error for the unsupported note-level `dynamics` attribute on part P1 in measure 39. |

The written oracle compares source part, displayed staff, source voice, written measure, exact onset, elapsed head or rest duration, and pitch spelling. Python's ElementTree reads the XML, and exact fractions account for backups, forwards and chords. Grace notes have a separate performed-time model and are excluded from the written tuple count. In the two full performed comparisons, the oracle matches playing ties, applies the source transposition, unfolds repeat barlines and converts times to 384 ticks per quarter. The player independently traverses the reparsed VexTab. [Oracle](reference.py) · [Assertions](check.mjs)

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

The browser command uses Chrome and writes a white-background preview PNG for each case in the same directory. It checks the complete Brandenburg III first violin, the complete *Gretchen* vocal part and the complete *Erlkönig* piano part on screen and in print. It also opens all eleven instruments in the Brandenburg I conductor view for written bars 1–8 and prints the first violin across those bars. Print coverage is checked from the SVG measure metadata on every page. [Browser checks](browser.mjs)

The selected print editions passed without rendering diagnostics. Other selections can produce diagnostics. For example, the complete Brandenburg I first violin and *Gretchen* keyboard print editions reported curve collisions during qualification. The projection may omit typography, secondary beam levels and markings such as unsupported articulations or wedges without an attack at their source offset. The returned warnings identify those locations.

## Credits

The Bach and Beethoven editions come from Mark Gotham and contributors to *Hauptstimme / OpenScore Orchestra*. The scores carry a CC0 1.0 dedication and the analytical annotations carry CC BY-SA. The Schubert transcriptions come from the OpenScore Lieder Corpus under CC0 1.0. The *Gretchen* file credits transcriber bradleykunda and identifies IMSLP edition 13971. The *Erlkönig* file identifies IMSLP edition 15041. [Hauptstimme rights and citation](https://github.com/MarkGotham/Hauptstimme/blob/8f677853c45b74ca0afcd79677e5379c06c82354/README.md) · [OpenScore Lieder rights and citation](https://github.com/OpenScore/Lieder/blob/38c5db510224d9facdc4b08d741fc788cfb58ea8/README.md)
