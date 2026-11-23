% The upper voice crosses to the other staff, then returns with its own clock and register.
\version "2.26.0"
\score {
  \new PianoStaff <<
    \new Staff = "up" \relative c' {
      \time 2/4 c4 \change Staff = "down" e |
      \change Staff = "up" g2 |
    }
    \new Staff = "down" \fixed c { \clef bass \time 2/4 c2 | f2 | }
  >> \layout {}
}
