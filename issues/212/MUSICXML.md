# Complete MusicXML scores and performed form

The uncut Finale edition of *Echigo-Jishi* imports all 47 measures. Its 163 pitched attacks and six rests retain every written onset and duration. The actual VexTab player agrees with a separately published Mutopia MIDI recording on every pitch, start and release. All 88 nonempty Japanese syllables keep their original anchors, including ツ on a rest. The conversion reports omissions for engraving coordinates, secondary beams, empty lyric fields and additional sound settings. [Finale score and PDF](https://www.musicxml.com/music-in-musicxml/example-set/) · [Mutopia MIDI edition](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1985)

| Published score or control | What the check observes |
| --- | --- |
| J. S. Bach, *Aus meines Herzens Grunde*, BWV 269 | The historical MusicXML 3.0 export from music21 and MuseScore contains all four SATB parts. Each has 24 written measures and 32 performed visits. All 229 written notes and 302 performed attacks match the XML edition, including its unmarked pickup, two split bars, repeat and tied releases. Stanford's Humdrum edition agrees on soprano, tenor and bass. It ties the alto G4 and F♯4 where the XML edition repeats each pitch. The test checks these exact differences. [MusicXML source](https://github.com/cuthbertLab/music21/blob/40e95ae567fe8b8e35317447dc74d5cdbb2fb83d/music21/corpus/bach/bwv269.mxl) · [Independent Humdrum score and scan links](https://github.com/craigsapp/bach-370-chorales/blob/a95574f9e93b4d72a96cd390a059df4f8471ddb6/kern/chor001.krn) |
| Haydn, *Emperor* Quartet, Op. 76 No. 3 | In the complete first movement, the two shared bodies end at written ordinals 44 and 123. The first endings each span three measures. All four parts produce the same 247 visits across 128 written bars. A selected cello follows brackets printed only above violin I. The full four-movement score reaches a located unsupported Fine in the Menuetto. The finale has a repeat without an explicit start inside the selected range. [Source provenance and second-movement checks](../210/README.md) |
| Schumann, *Im wunderschönen Monat Mai* | The held-out Finale export has two parts and 27 measures. The first blocking construct is a whole-rest glyph lasting two quarter notes in 2/4, without an explicit measure-rest attribute, in the singer's bar 26. The importer returns its source range. [Publisher's score and edition](https://www.musicxml.com/music-in-musicxml/example-set/) |
| W3C community test suite | A five-pass repeat has two written bars and six performed visits. A first/second ending produces the order 1, 2, 1, 3, 4. A nonconsecutive ending marked “3, 5, 7” returns a located error. [Pinned upstream fixtures](https://github.com/w3c-cg/musicxmlTestSuite/tree/0618bdee1bfcb965ffdd9f4e52271c909d744fd1/xmlFiles) |

## Written repeats

The importer reads consecutive numbered endings with a backward repeat on the last bar of each returning ending. It shares missing repeat marks across parts on the same measure grid. An implicit backward repeat can return to the beginning of a complete piece. A selection that starts inside a known repeat or needs an earlier unresolved start gets a diagnostic.

A counted repeat keeps one written copy and supports 2 through 32 passes. The five-pass example below displays a repeat barline with ×5 on screen and in the printed part. Expressive input using this syntax advertises VexTab 6.5.0. [MusicXML repeat attributes](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/repeat/)

~~~vextab
meter 4/4
staff {
  repeatCount 5 { :w C4 | }
  :w D4 |
}
~~~

## Reproduce

~~~sh
npm run build-dev
npm test --prefix importer
node issues/212/musicxml-full.mjs
node issues/212/musicxml-full.mjs --held-out
node issues/212/musicxml-surfaces.mjs
~~~

The default runner uses checked-in files. The held-out run fetches Bach, the independent Humdrum score and Schumann into a checksum-verified build cache. The complete-piece checks import the original MXL and its plain XML, compare their generated text, parse it with the public VexTab parser and run the production player's repeat traversal and note scheduler. The written oracle uses Python's ElementTree and exact rational durations. The separate browser check reads the screen SVG and all printed part pages. [Assertions](musicxml-full.mjs) · [Reference implementation](musicxml-reference.py) · [Per-source results](musicxml-corpus.json)

Tom Potter dedicated the Finale *Echigo-Jishi* transcription to the public domain. The corresponding Mutopia edition lists public-domain status. Its unchanged MIDI and archived note observations are included for offline qualification. Regenerate the observations with `uv run --with mido==1.3.3 issues/212/musicxml-reference.py --midi`. The three W3C fixtures retain their upstream MIT notice. [Finale edition credits](https://wpmedia.musicxml.com/wp-content/uploads/2017/12/Echigo-Jishi.pdf) · [Mutopia credits](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1985) · [W3C fixture license](musicxml/W3C-LICENSE)
