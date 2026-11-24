\version "2.16.1"
\header {
  title = "24 Studies for the Guitar"
  subtitle = "Study No. 22"
  composer = "Fernando Sor"
  mutopiatitle = "Op. 35, Study No. 22"
  mutopiacomposer = "SorF"
  mutopiainstrument = "Guitar"
  opus = "Op. 35 No. 22"
  style = "Classical"
  copyright = "Creative Commons Attribution-ShareAlike 3.0"
  source = "N. Simrock"
  % From Boije 481-2, enscribed "Bonn Chez N. Simrock"
  date = "1828"
  maintainer = "Glen Larsen"
  maintainerEmail = "glenl.glx at gmail.com"

 footer = "Mutopia-2013/08/18-1850"
 tagline = \markup { \override #'(box-padding . 1.0) \override #'(baseline-skip . 2.7) \box \center-column { \abs-fontsize #10 \line { Sheet music from \with-url #"http://www.MutopiaProject.org" \line { \concat { \abs-fontsize #8 www. \abs-fontsize #11 MutopiaProject \abs-fontsize #8 .org } \hspace #0.5 } • \hspace #0.5 \italic Free to download, with the \italic freedom to distribute, modify and perform. } \line { \abs-fontsize #10 \line { Typeset using \with-url #"http://www.LilyPond.org" \line { \concat { \abs-fontsize #8 www. \abs-fontsize #11 LilyPond \abs-fontsize #8 .org }} by \concat { \maintainer . } \hspace #0.5 Copyright © 2013. \hspace #0.5 Reference: \footer } } \line { \abs-fontsize #8 \line { Licensed under the Creative Commons Attribution-ShareAlike 3.0 (Unported) License, for details \concat { see: \hspace #0.3 \with-url #"http://creativecommons.org/licenses/by-sa/3.0" http://creativecommons.org/licenses/by-sa/3.0 } } } } }
}

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

  d'2-2 d4 |
  fis2 fis4 |
  e2 e4 |
  d2-1 d4 |
  \barNumberCheck #13
  e2 e4 |

  d2 d4 |
  cis2 cis4 |
  b2-4\3 s8 r8 |			% eh, to match source
  \repeat volta 2 {
    fis'2 fis4 |
    e2 e4 |

    d2-2 d4 |
    cis2 cis4 |
    d2 fis4 |
    e2 cis4 |
    d2 d4 |

    \barNumberCheck #24
    cis2 s4 |
    <dis-4>2 dis4 |
    <e-0>2 b4 |
    <cis-2>2 cis4 |
    d2-2 d4 |

    c2-1 c4 |
    g'4-4 e c-1 |
    b2-0 b4 |
    \barNumberCheck #32
    ais2-2 s4 |
    d2 d4 |

    fis2 fis4 |
    e2 e4 |
    d2 d4 |
    \barNumberCheck #37
    cis2 cis4 |
    d2 d4 |

    e2 eis4 |
    fis2 s4 |
    fis2 g4 |
    gis2-1 gis4 |
    ais2 ais4 |

    b2-4 b4 |
    g2-2 g4 |
    fis2-1 fis4 |
    fis2-1( fis8[) ais,8] |
    <b-4 d,-0 b-1>2 b4\rest
  }
}

% Voice 2 is used for the second part of the melody and bass is in
% voice 3. This seemed to work out the best for collisions.
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
  d8 <b-4\3> <fis-3>[ b\3 ] \stemNeutral d b\3 |
  fis'[ d ] \stemUp fis,[ d' ] \stemNeutral fis d |
  e[ cis ] \stemUp fis,[ cis' ] \stemNeutral e cis |
  d[ <b-2\3> ] \stemUp <g-3\4>[ b\3 ] \stemNeutral d b\3 |
  \barNumberCheck #13
  e[ cis ] \stemUp g[ cis ] \stemDown e cis \stemNeutral |
  d[ b\3 ] \stemUp fis[ b\3 ] \stemNeutral d b\3 |
  cis[ ais ] \stemUp fis[ ais ] \stemNeutral cis ais |
  b\3[ <d-2> ] \stemUp <fis,-3>[ b\3 ] \stemNeutral b,4 |
  \repeat volta 2 {
    fis''8[ d ] \stemUp fis,[ d' ] \stemNeutral fis d |
    e[ a, ] \stemUp fis[ cis' ] \stemNeutral e cis |
    d[ <b-4\3> ] \stemUp fis[ b\3 ] \stemNeutral d b\3 |
    cis[ ais ] \stemUp fis[ ais ] \stemNeutral cis ais |
    d[ b\3 ] \stemUp fis[ b\3 ] \stemNeutral fis' d |
    e[ cis ] \stemUp fis,[ ais ] \stemNeutral cis ais |
    d[ b\3 ] \stemUp fis[ b\3 ] \stemNeutral d b\3 |
    \barNumberCheck #24
    cis8[ fis ] ais,[ cis ] fis,4 |
    dis'8[ <a-1> ] <fis-3>[ a ] dis a |

    e'8[ <g,-0> ] <e-1>[ g ] \stemDown <b-0> g |
    cis8 <g-0> <e-1> g cis[ g ] |
    \barNumberCheck #28
    d'[ d,\5 ] <fis-1>[ a ] d a |
    c8[ g ] <e-2>[ g ] c g |
    e g e g e g |

    b8[ <gis-2> ] <d-0>[ gis ] b gis |
    \barNumberCheck #32
    ais8 <cis,-3> <fis-4>[ ais ] <cis-1> <fis-1> |
    d8 b\3 \stemUp fis[ b\3 ] \stemNeutral d b\3 |
    fis'8[ d ] fis,[ d' ] fis d |
    e[ cis ] fis,[ cis' ] e cis |
    d[ b\3 ] fis[ b\3 ] d b\3 |
    cis[ ais ] fis[ ais ] cis ais |
    d[ b\3 ] fis[ b\3 ] d b\3 |

    e[ b ] g[ b ] eis b |
    fis'[ fis,] ais[ cis ] \stemUp e, cis' \stemNeutral |
    <fis-1>[ <d-2> ] <b-3\3>[ d ] g d |
    gis[ <eis-4\2> ] <b-1\3>[ eis\2 ] gis eis\2 | % missing 1/4 on 2nd beat?
    ais[ <e!-2\2> ] <cis-3\3>[ e\2 ] ais e\2 | % missing 1/2 on 2nd beat?

    b'[ <b,-0\4>] <d-3\3>[ b\4 ] b' b,\4 |
    g'[ <cis,-1> ] <b-3\3>[ cis ] g' cis, |
    fis[ <d-2>] <b-4\3>[ d ] fis d |
    fis[ cis-1] ais-2[ cis ] s4 |
    s2.
  }
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
  b,2 s4 |
  s4 fis'2 |
  s4 fis2 |
  s4 g2\4 |
  \barNumberCheck #13
  s2 e4 |

  s4 fis2 |
  s4 fis2 |
  s4 fis4 s4 |
  \repeat volta 2 {
    s4 fis2 |
    s4 fis2 |

    s4 <fis-3>2 |
    \repeat unfold 4 { s4 fis2 | }

    \barNumberCheck #24
    s2. |
    <cis-1>2. |
    e,2. |
    a2. |
    s2. |

    e2. |
    s2. |
    eis2. |
    fis2. |
    b2. |

    s4 fis'2 |
    s4 fis2 |
    s4 fis2 |
    s4 fis2 |
    s4 fis2 |

    s4 g2 |
    s2 e4 |
    d2. |
    cis2. |
    fis2.\5( |

    g2.\5 ) |
    \set fingeringOrientations = #'(left)
    <e-1>2. |
    <fis-3>2. |
    <fis,-1>2 <e'-1>4 |
    s2.
  }
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
