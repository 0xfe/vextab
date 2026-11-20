# Score colours

Set the default ink inside a part. A mark after an attack can colour that note or its chord name. Text labels and independent text lanes also accept an ink setting. Use CSS colour names or hex values.

```vextab2
meter 2/4
guitar { view tab ink SeaGreen ink default at 2
  0/1[ink #1565c0, symbol "Em" ink crimson] 2/1 |
  break system 3/1 0/1 |
}
```

The first fret is blue, the second inherits the green staff colour, and the Em label is crimson. Bar two returns to the default ink. [Editable example](../guide/features.html#score-colours)
