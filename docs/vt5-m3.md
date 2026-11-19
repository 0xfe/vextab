# Responsive guitar scores and lead sheets

Run `npm ci` and `npm start`, then open the [editable guitar and lead-sheet studies](http://127.0.0.1:9005/guide/studies.html). The packaged guide opens offline at `dist/guide/studies.html`. Switch studies to keep an edit in the current page session. **Reset study** restores the selected score.

## Play the Drop D turnaround

The upper voice plays the melody over a separate sixth-string bass. In bar 4, fret 5 on string two sounds E4. Hold it while bending fret 7 on string three from D4 up to the same E4, then release. The half note starts on beat one, reaches the peak on beat two, holds until halfway through beat two and returns on beat three. Try changing `rise=1/2` to `rise=1/4` to reach the unison an eighth note earlier. [Complete two-voice score](../guide/scores/drop-d-turnaround.vextab)

```vextab
options tab-stems=true
tabstave notation=true time=4/4 tuning=dropd capo=0 voice=top
notes :h (5/2.7/3) !bend 3 +2 rise=1/2 hold=3/4 release=1/1! :q 3/2 2/3 |
voice voice=bottom
notes :w 0/6 |
```

| To write | Enter | What to read |
| --- | --- | --- |
| Capo and tuning | `tuning=dropd capo=2` on the stave | Fret numbers are relative to the capo. Open string six sounds E2 and is written E3. Removing the capo gives D2. In standard tuning with no capo it sounds E2. These are score pitches. Playback is a separate feature. |
| Bend one string in a chord | `!bend 3 +2 rise=1/2 hold=3/4 release=1/1!` after the chord | The string number picks the head. The amount is in semitones. Phase endpoints are fractions of the full attack. Hold and release are optional. Read the contour on tab, including in the paired view. |
| Palm mute | `0/6 !pm 6!` through `0/6 !end-pm!` | Both endpoint attacks are included. The line follows the selected strings in this voice across automatic breaks. A comma-separated list such as `6,5` targets two strings. Close the span within the same voice declaration. |
| Dead strike | `X/3` | Play the muted third string at the written time. Tab shows X. The event has a string and no sounding pitch. |
| Silent time | `:h ## !silent!` | Leave half a bar of 4/4 silent in this voice. The next attack keeps its onset. A short silent position breaks its beam. |

## Wrap and navigate a score

Put `options measure-numbers=true` before the first stave. Add boundary commands before the first attack of a bar in the first voice. Write the same repeat barlines in every voice.

| Mark | Example | Scope |
| --- | --- | --- |
| Rehearsal | `!mark "B"!` | Identifies the following bar when its position on the page changes. |
| First and second endings | `!ending 1 bars=4!`, then `!ending 2 bars=2!` | Each starts in the current bar and spans the given count of written bars. Use repeat barlines for the repeat itself. |
| Key change | `!key G!` | Changes the signature and pitch interpretation for every voice from this boundary. A new stave declaration establishes its own key. Mid-bar changes receive a source diagnostic. |
| Explicit row | Start another `stave` or `tabstave` | Forces a new row. Within a declaration, flow chooses breaks between whole measures. An indivisible overfull bar remains readable by scrolling and reports its line and column. |

Use `layout="flow"` on an SVG embed. Omitting `width` or setting `width="auto"` follows its container. A numeric width or `div.setWidth(480)` requests a fixed layout width in pixels. `div.setPart('tab')` switches a paired study to tab and `div.setPart('score')` restores both staves. Call `div.dispose()` when removing a mounted editor. [Parsing, source selection and independent parts](vt5-m2.md)

## Write a lead sheet

In **Slow river**, the first slash lasts a dotted quarter. The Am/G change lands on beat two. The syllable “riv” on that slash joins “er” on the following eighth. In bar 2, “roll” lasts through two more attacks while the bass changes underneath. [Complete lead sheet](../guide/scores/slow-river.vextab)

```vextab
stave time=4/4
notes :q (0/5.2/4.2/3.1/2.0/1) !chord "Am"! !frame x,0,2,2,1,0 barre=2:4-3! !lyric "Slow,"!
notes :qSd X/5 !chord "Am/G"! !lyric "riv" -! :8S X/5 !lyric "er"! :qS X/5 |
```

- Put `!chord "Am/G"!` after the attack it names. Labels use a measured lane above notation. On notation alone, a slash duration such as `:qSd` with `X/5` writes an unpitched rhythm slash.
- Put `!lyric "Slow,"!` after a note or slash. Quotes preserve punctuation and spaces. Use `-` inside the command after the closing quote to join the next syllable. Use `extend=2` to end the line at the second later attack. Both connectors stay in the same bar and voice. Lyrics require a notation staff. Layout diagnostics carry source positions.
- Put `!frame` after the labelled fretted chord. List one fret per string from lowest to highest. Use `x` for a muted or omitted string and `0` for an open string. A four-fret diagram above the music shows the actual voicing. In the example, `barre=2:4-3` places a mini-barre at fret two across strings four and three. A mismatch with the played chord points back to the frame.

## Verification and scope

In Chrome at 960 CSS pixels the 12-bar paired turnaround occupied two rows, breaking after bar 5. At 360 pixels it occupied six rows. Its first ending and sixth-string mute continued across row breaks. The 12-bar lead sheet occupied three and seven rows respectively. Its written breaks before bars 5 and 9 survived at both widths. Returning to the original width restored the positions and timing. The browser checks also compare tab and staff barlines, bend attachment, string targets and the extender’s clearance over the bass. The maintainer confirmed the string-three bend, stationary second string and bass mute in the desktop guitar study, and the barre and held lyric in the mobile lead-sheet opening. [Engraving checks](../tests/studies.ts) · [Guide and package checks](../scripts/test-browser.mjs)

Independent tab parts can carry a timed bend and its palm-mute string targets. VexFlow 5.6 also engraves chord labels, notation lyrics, tab ties, and repeat endings in independent parts. Chord frames, silent positions, and tab endings that join a fret to a rest still need the screen pass. Requesting one in an independent part returns a diagnostic at the source. Use the existing fixed-layout Artist for legacy multi-note bend phrases.

**Rasgueado remains proposed.** A VexFlow trial engraved four sixteenth-note strokes at both widths. It retained the fingers a–m–i–i and reversed string direction for the last stroke. A VexTab spelling still needs a player-reviewed example that distinguishes right-hand motion, string direction and stroke timing.
