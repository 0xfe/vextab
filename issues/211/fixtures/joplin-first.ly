\version "2.14.2"

top =  \relative c' {
 \override TextScript   #'padding = #2
 
 \key as \major
 \time 2/4
 \clef treble
 \partial 8
 r8 \f |
 \repeat volta 2 {
  r16 as' <es' es,> as, c <es es,>8 g,16 |
  <es' es,>16 g, bes <es es,> ~ <es es,>4 |
  r16 as, <es' es,> as, c <es es,>8 g,16 |
  <es' es,>16 g, bes <es es,> ~ <es es,>8 r16 <es es,> |
  r16 as, ces <fes fes,> r16 <es es,> r16 <es es,> |
  r16 as, ces <fes fes,> r16 <es es,> r8 |
  \change Staff = "down"
   \stemUp r16^\p as,,,-( ces as'-) r as-( ces as'-) \stemNeutral |
  \change Staff = "up"
  r16 as-( ces as'-) r as-( ces as'-) |
  <as as,>8-\mf \< <as as,> <as as,> <as as,>16 <as as,> ~ |
  <as as,> \! es f c es <f as,>8 <as, fes>16 ~ |
  <as fes!> bes <ces fes,> as bes <c es,>8 as16 |
  <c es,> as <bes es,>8 <as es> r16 <as as,> ~ |
  <as as,>8 <as as,> <as as,> <as as,>16 <as as,> ~ |
  <as as,> es <f as,> c es <f as,>8 <as, fes>16 ~ |
  <as fes> bes <ces fes,> as bes <c es,>8 as16 |
 } \alternative {
  { <c es,> as <bes es,>8 <as es> r8 }
  { <c es,>16 as <bes es,>8 <as es> r8 }
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
  <as as,> <c as es> <c as es> <a a,> |
  <bes bes,> <des g, es> <des g, es> <es, es,> |
  <fes fes,>4 <es es,>8 <es es,> |
  <fes fes,>4 <es es,>8 r |
  \stemDown as,, r as' r \stemNeutral |
  as' r as' r \clef treble |
  <b as f d> <b as f d> <b as f d> <b as f d> |
  <c as es> <c as es> <c as es> <c as es> |
  <ces as fes> <ces as fes> <c as es> <c as es> |
  <c as es> <des g, es> <c as> r \clef bass |
  <b, as f d> <b as f d> <b as f d> <b as f d> |
  <c as es> <c as es> <c as es> <c as es> |
  <ces as fes> <ces as fes> <c as es> <c as es> |
 } \alternative {
  { <c as es> <des g, es> <c as> <es, es,> }
  { <c' as es> <des g, es> <c as> <a a,> }
 }
}

\score {
  \context PianoStaff <<
  \context Staff = "up"
   \top 
  \context Staff = "down"
   \bottom
 >>
 
 \layout {}

}

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
