# Score colours

Use a CSS colour name such as `crimson` or `SeaGreen`, or a hex value such as `#1565c0`. Names are case-insensitive. Hex colours accept three, four, six or eight digits.

| Where | Example | Scope |
| --- | --- | --- |
| Stave | `tabstave notation=true color=SeaGreen` | The written row, its voices, and both staff and tab. Each new stave starts with its usual ink. |
| Single attack | `notes 0/1 !color #1565c0! 2/1` | The preceding note, chord or rest. A shared beam follows the stave colour. |
| Fixed annotation | `notes C/4 $.Times-14-bold-crimson.Am$` | This label only. The fourth font field is optional. |
| Fixed text voice | `text .font=Times-12-italic-darkorange, dolce` | Subsequent text in this voice until another font command. |
| Flow chord label | `notes 0/1 !chord "Am" color=crimson!` | This label only, including in an independent part. |

In this flow example the first fret is blue, the chord label is crimson, and the second fret keeps the stave colour. Both frets retain the paper behind their numbers. The next row uses the default ink.

```vextab
tabstave time=2/4 color=SeaGreen
notes 0/1 !color #1565c0! !chord "Am" color=crimson! 2/1 |
tabstave time=2/4
notes 3/1 0/1 |
```

The fixed renderer honours colour on SVG and Canvas. Flow parts retain colours in standalone SVG and print output.
