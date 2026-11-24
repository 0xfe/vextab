% Relative chord anchor, nested written tuplets and inherited durations.
\version "2.26.0"
\score {
  \new Staff = "solo" \relative c' {
    \time 4/4 <c e g>4 b a g |
    \tuplet 3/2 { c4 \tuplet 3/2 { d8 e f } g4 } a2 |
  }
  \layout {}
}
