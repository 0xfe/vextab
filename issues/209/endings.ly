% Two distinct written endings and a continued voice.
\version "2.26.0"
\score {
  \new Staff = "solo" \relative c' {
    \time 2/4 \repeat volta 2 { c4 d |
    \alternative { \volta 1 { e4 f | } \volta 2 { g4 a | } } }
    b2 |
  } \layout {}
}
