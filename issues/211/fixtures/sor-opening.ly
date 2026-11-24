\version "2.16.1"

upperVoice = \relative c' {
  \tempo "Allegretto."
  \voiceOne
  d2-2 d4 |
  fis2-1 fis4 |
  e2-0 e4 |
  d2-2 d4 |

  cis2-1 cis4 |
  d2-2 d4 |
  e2-0\1 eis4-1 |
  fis2-1 \stemDown fis,4 \stemUp |
}

lowerVoice = \relative c' {
  \voiceTwo
  \set fingeringOrientations = #'(up)
  \stemDown d8[ <b-4\3> ] \stemNeutral <fis-3>[ b\3 ] \stemDown d b\3 |
  fis'8[ d ] \stemUp fis,[ d' ] \stemNeutral fis d |
  e[ <cis-1> ] \stemUp fis,[ cis' ] \stemNeutral e cis |
  d[ <b-4\3> ] \stemUp <fis-3>[ b\3 ] \stemNeutral d b\3 |
  cis[ <ais-2> ] \stemUp <fis-3>[ ais ] \stemNeutral cis ais |
  d[ <b-4\3> ] \stemUp <fis-3>[ b\3 ] \stemNeutral d b\3 |
  <e-0\1>[ <b-0\2> ] \stemUp <g-0\3>[ b\2] \stemNeutral eis b\2 |
  fis'[ <cis-1>] <ais-2>[ <cis-1>] <fis,-3> ais |
}

middleVoice = \relative c' {
  \voiceThree
  \stemDown \slurDown \tieDown
  \set fingeringOrientations = #'(down)
  b,2.~ |
  b2. |
  s4 fis'2 |
  s4 fis2 |
  s4 fis2 |
  s4 fis2 |
  s4 g2\3 |
  s2. |
}

\score {
  <<
    \new Staff = "guitar"
    <<
      \clef "treble_8"
      \time 3/4
      \key b \minor
      \mergeDifferentlyHeadedOn
      \mergeDifferentlyDottedOn
      \context Voice = "upperVoice" \upperVoice
      \context Voice = "lowerVoice" \lowerVoice
      \context Voice = "middleVoice" \middleVoice
    >>
%{
    \new TabStaff = "guitar tab"
    <<
      \clef moderntab
      \time 3/4
      \key b \minor
      \context TabVoice = "upperVoice" \upperVoice
      \context TabVoice = "lowerVoice" \lowerVoice
      \context TabVoice = "middleVoice" \middleVoice
    >>
%}
  >>
  \layout {
    % remove string numberings since we have developed a tablature
    \override Voice.StringNumber #'stencil = ##f
  }
}
\score {
  <<
    \set Staff.midiInstrument = #"acoustic guitar (nylon)"
    \clef "treble_8"
    \time 3/4
    \key b \minor
    \context Voice = "upperVoice" \upperVoice
    \context Voice = "lowerVoice" \lowerVoice
    \context Voice = "middleVoice" \middleVoice
  >>
  \midi {
    \tempo 4 = 100
  }
}
