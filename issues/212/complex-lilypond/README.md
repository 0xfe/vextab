# Bach, Well-Tempered Clavier I, Fugue in C major, BWV 846

The [complete four-voice edition](bwv846.ly) was entered by Shay Rojansky and updated by Andreas Scherer. Mutopia lists the transcription as public domain. The importer reads the original LilyPond 2.16.1 bytes. The score contains one piano with two anonymous staves, four named voices, overlapping ties, manual beams, ornaments and explicit system breaks. [Mutopia edition and rights](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=4) · [Pinned source](https://github.com/MutopiaProject/MutopiaProject/blob/2144afd6f52d56c5b6995b8b589ef1268b3139f0/ftp/BachJS/BWV846/wtk1-fugue1/wtk1-fugue1.ly)

Use `{targetProfile: 'expressive', mode: 'partial', score: 'print'}` at default capacity. The MIDI selection also retains the source tempo of 66 quarter notes per minute. Each selection produces one piano part with 27 bars on both staves. The output requires VexTab 6.6.0. Strict conversion stops at the first voice preset with unsupported engraving properties.

| Voice | Written noteheads and rests | Performed noteheads |
| --- | ---: | ---: |
| Soprano | 241 | 216 |
| Tenor | 234 | 199 |
| Alto | 205 | 176 |
| Bass | 168 | 143 |
| **Total** | **848** | **734** |

The 847 written events contain 787 noteheads and 61 rests. The score retains 770 directed stems, all 53 outgoing tie directions and the two authored cross-bar beams. The tenor beam joins bars 10–11 and the soprano beam joins bars 20–21. The tenor’s twelve upward stems leave its downward tie directions intact.

Twelve source diagnostics locate three ornament signs, four system breaks, four voice presets and the final double barline. The voice presets also control rests, scripts, note columns and grace styling. These properties still use the target’s engraving defaults.

The [native reference](bwv846.tsv) records the onset, duration, spelled pitch and staff of each written head or rest. Separate native MIDI tracks for the four voices supply each sounding pitch, attack and release. This preserves independent voices through unisons. The [whole-edition test](../lilypond/check.mjs) compares these rows to the VexTab public parser, score projection and literal player for both output selections.

## Reproduce

From the repository root, run these commands with the host and importer built. The first two commands verify the checked-in file against the exact upstream commit. The last command runs from the checked-in sources offline.

```sh
curl -fsSL https://raw.githubusercontent.com/MutopiaProject/MutopiaProject/2144afd6f52d56c5b6995b8b589ef1268b3139f0/ftp/BachJS/BWV846/wtk1-fugue1/wtk1-fugue1.ly -o /tmp/bwv846-mutopia.ly
cmp /tmp/bwv846-mutopia.ly issues/212/complex-lilypond/bwv846.ly
node issues/212/lilypond/check.mjs
```

The source SHA-256 is `10d51eabac0fdfeddcbb7d76ad3bf361d4c095feec3ce7aa61d034d5b836c708`. With LilyPond 2.26.0 and Python mido 1.3.3 installed, regenerate observations in a temporary directory and compare them to the checked-in reference.

```sh
python3 issues/212/lilypond/reference.py --edition bwv846
```
