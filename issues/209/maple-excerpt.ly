% Selected written pickup and two measures from Chris Sawer’s public-domain Mutopia edition.
\version "2.14.2"

top =  \relative c' {
 \key as \major
 \time 2/4
 \clef treble
 \partial 8
 r8 \f |
 \repeat volta 2 {
  r16 as' <es' es,> as, c <es es,>8 g,16 |
  <es' es,>16 g, bes <es es,> ~ <es es,>4 |
 }
}


bottom =  \relative c {
 \key as \major
 \time 2/4
 \clef bass
 \partial 8
 <es es,>8 |
 \repeat volta 2 {
  <as as,> <c as es> <c as es> <a a,> |
  <bes bes,> <des g, es> <des g, es> <es, es,> |
 }
}


% score-block
\score {
  \context PianoStaff <<
  \context Staff = "up"
   \top
  \context Staff = "down"
   \bottom
 >>

 \layout {}

}

% score-block
\score {
  \context PianoStaff <<
  \context Staff = "up"
   \applyMusic #unfold-repeats \top
  \context Staff = "down"
   \applyMusic #unfold-repeats \bottom
 >>

 \midi {
  \context {
   \Score tempoWholesPerMinute = #(ly:make-moment 120 4)
  }
  \context {
   \Voice
   \remove Dynamic_performer
  }
 }
}
