% Two clocks with source-order duration and octave inheritance across branches.
\version "2.24.4"
\language "english"
cell = { df8 ef }
\score {
  \new Staff = "solo" \relative c' {
    \time 4/4 c2 << { d8 e f g } \\ { a b c d } >> |
    b4 \cell \fixed c' { fs4 } g4 |
  }
  \layout {}
}
