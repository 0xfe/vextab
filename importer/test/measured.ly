\version "2.26.0"
theme = \relative c' {
  \time 2/4
  <c e g>4 d8 e |
  \tuplet 3/2 { f8 e d } c4 |
}
\score { \new Staff { \theme } }
