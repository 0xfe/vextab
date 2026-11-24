\version "2.14.2"

\header {
 title = "Maple Leaf Rag"
 composer = "Scott Joplin"
 piece = "Tempo di marcia"

 mutopiatitle = "Maple Leaf Rag"
 mutopiacomposer = "JoplinS"
 mutopiainstrument = "Piano"
 date = "c. 1899"
 style = "Jazz"
 copyright = "Public Domain"
 source = "Reproduction of original edition (1899)"

 maintainer = "Chris Sawer"
 maintainerEmail = "chris@mutopiaproject.org"
 maintainerWeb = "http://cjsawer.whitewillow.co.uk/"

 footer = "Mutopia-2011/11/13-23"
 tagline = \markup { \override #'(box-padding . 1.0) \override #'(baseline-skip . 2.7) \box \center-column { \small \line { Sheet music from \with-url #"http://www.MutopiaProject.org" \line { \teeny www. \hspace #-0.5 MutopiaProject \hspace #-0.5 \teeny .org \hspace #0.5 } • \hspace #0.5 \italic Free to download, with the \italic freedom to distribute, modify and perform. } \line { \small \line { Typeset using \with-url #"http://www.LilyPond.org" \line { \teeny www. \hspace #-0.5 LilyPond \hspace #-0.5 \teeny .org } by \maintainer \hspace #-0.6 . \hspace #0.5 Reference: \footer } } \line { \teeny \line { This sheet music has been placed in the public domain by the typesetter, for details see: \hspace #-0.5 \with-url #"http://creativecommons.org/licenses/publicdomain" http://creativecommons.org/licenses/publicdomain } } } }
}

\paper {
  top-margin = 15
  bottom-margin = 10
  min-systems-per-page = #4
  max-systems-per-page = #5
  system-system-spacing #'padding = #8
}

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
 
 \break
 
 \repeat volta 2 {
  r16_\markup {\dynamic f \italic "stacc."} g' <es' es,> g, bes <d d,>8 g,16 |
  <des'! des,!> g, bes <c c,> ~ <c c,> es, <bes' bes,> es, |
  r c <as' as,> c, es <f f,>8 c16 |
  <as' as,> c, es <f f,> ~ <f f,> c <f f,>8 |
  r16 es <g g,> bes, des <f f,>8 es16 |
  <g g,> bes, des <f f,> ~ <f f,> des <f f,>8 |
  r16 c <as' as,> c, es <f f,>8 c16 |
  <as' as,> c, es <f f,> ~ <f f,> c <f f,>8 |
  r16 g <es' es,> g, bes <d d,>8 g,16 |
  <des'! des,!> g, bes <c c,> ~ <c c,> es, <bes' bes,> es, |
  r c <as' as,> c, es <f f,>8 c16 |
  <as' as,>8 <as as,> <g g,> <ges ges,> |
  r16 f, a c f c a f |
  r f bes des <f f,>8 <des bes f> |
  <c as f d> r16 <c as f d> r <bes des,>8 es,16 |
 } \alternative {
  { <as c,>8 <es' es,> <es es,> <es es,> }
  { r16 as, c es <as as,>8 r }
 }
 
 r16-\f as, <es' es,> as, c <es es,>8 g,16 |
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
 <c es,> as <bes es,>8 <as es> <as' as,> |
 
 \key des \major
 \repeat volta 2 {
  <as es c as>8.^\markup {\large "TRIO"} <as es c bes>16 ~ <as es c bes>16 <es c> bes8 |
  <as' es c as>8. <as es c bes>16 ~ <as es c bes>16 <es c> bes <es c> |
  as, des bes des f as, des f |
  bes, des f as, ~ as f' bes, f' |
  <as es c as>8. <as es c bes>16 ~ <as es c bes>16 <es c> bes8 |
  <as' es c as>8. <as es c bes>16 ~ <as es c bes>16 <es c> bes <es c> |
  as, des bes des f as, des f |
  bes, des f as, ~ as f' a, <f' es> |
  <bes f d bes>8. <bes f d c>16 ~ <bes f d c>16 <f d> c8 |
  <bes' f d bes>8. <bes f d c>16 ~ <bes f d c>16 <f d> c <f d> |
  r es <bes' bes,> es, ges <c c,>8 es,16 |
  <bes' bes,> es, ges <c c,> ~ <c c,> es, <bes' bes,>8 |
  <des fes, des> <des fes, des> <c fes, c> <bes fes bes,> |
  <f! as,>16 des es <ges bes,> ~ <ges bes,> bes, <f' as,>8 |
  <f g,>16 des es <f ges,> ~ <f ges,> c <es ges,> <des f,> ~ |
 } \alternative {
  { <des f,>16 <as' as,>8 f16 <as as,> f <as as,> f }
  { <des f,>16 des f as <des des,>8 r }
 }
 
 \break
 
 \key as \major   
 \repeat volta 2 {
  <as as,> <f as,> <as as,> <f as,> |
  <as f> <bes f>16 <c f,> ~ <c f,> bes as f |
  es f8 <c as>16 ~ <c as>4 |
  r16 es <f as,> c es <f as,>8 c16 |
  <es g,>8 f16 <bes, g> ~ <bes g>4 |
  r16 des <f g,> bes, des <f g,>8 <c as>16 ~ |
  <c as> es <f as,> c es <f as,>8 <c as>16 ~ |
  <c as> es <f as,> c es <f as,>8 es16 |
  <as as,>8 <f as,> <as as,> <f as,> |
  <as f> <bes f>16 <c f,> ~ <c f,> bes as f |
  as8 f es16 as8 <c, as>16 ~ |
  <c as> es <f as,> c es <f as,>8 <as, f>16 ~ |
  <as f> bes <as f>8 <as fes> <bes fes>16 <as es> ~ |
  <as es> bes <c es,> as bes <c es,>8 <as d,>16 ~ |
  <as d,!> bes <c d,> as r <bes des,>8 es,16 |
 } \alternative {
  { <as c,>8 <es' es,> <es es,> <es es,> }
  { <as, c,> <es' des g,> <as es c as> }
 }
 
 \bar "|."
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
 
 \repeat volta 2 {
  <bes bes,>8 <des g, es> <es, es,> <des' g, es> |
  <bes bes,> <des g, es> <es, es,> <g g,> |
  <as as,> <c as es> <es, es,> <c' as es> |
  <as as,> <c as es> <as as,> <a a,> |
  <bes bes,> <des g, es> <es, es,> <des' g, es> |
  <bes bes,> <des g, es> <bes bes,> <b b,> |
  <c c,> <c as es> <es, es,> <c' as es> |
  <as as,> <c as es> <as as,> <a a,> |
  <bes bes,> <des g, es> <es, es,> <des' g, es> |
  <bes bes,> <des g, es> <es, es,> <g g,> |
  <as as,> <c as es> <es, es,> <c' as es> |
  <as as,> <as as,> <g g,> <ges ges,> |
  <f f,> <f f,> <a a,> <a a,> |
  <bes bes,> <des bes f> <des bes f> <des bes f> |
  <bes f bes,> <bes f bes,> <es, es,> <g g,> |
 } \alternative {
  { <as as,> <c as es> <c as es> <a a,> }
  { <as as,> <es' c as> <es c as> <es, es,> }
 }
 
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
 <c as es> <des g, es> <c as> r |
 
 \key des \major
 \repeat volta 2 {
  <es, es,> <ges' c, as> <ges, ges,> <ges' c, as> |
  <f, f,> <ges' c, as> <es, es,> <c c,> |
  <des des,> <f' des as> <as, as,> <f' des as> |
  <f, f,> <f' des as> <des, des,> <d d,> |
  <es es,> <ges' c, as> <ges, ges,> <ges' c, as> |
  <f, f,> <ges' c, as> <es, es,> <c c,> |
  <des des,> <f' des as> <as, as,> <f' des as> |
  <f, f,> <f' des as> <des, des,> <c c,> |      
  <bes bes,> <as'' d, bes> <d,, d,> <as'' d, bes> |
  <f, f,> <as' d, bes> <bes, bes,> <as' d, bes> |
  <es, es,> <ges' es bes> <ges, ges,> <ges' es bes> |
  <es, es,> <ges' es bes> <ges, ges,> <ges' es bes> |
  g,16 bes8 des16 fes des bes g |
  <as as,>8 <f'! des as> bes,, <d' bes as> |
  <des! bes es,> <des bes es,> <c as> <c as> |
 } \alternative {
  { <des des,> <f des as> <f des as> <d, d,> }
  { <des' des,> <as as,> <des, des,> <c' c,> }
 }
 
 \key as \major
 \repeat volta 2 {
  <des des,> <f des as> <f des as> <c c,> |
  <des des,> <f des as> <bes, bes,> <b b,> |
  <c c,> <es c as> <es c as> <es, es,> |
  <as as,> <c as es> <es, es,> <a a,> |
  <bes bes,> <des g, es> <es, es,> <a a,> |
  <bes bes,> <des g, es> <es, es,> <g g,> |
  <as as,> <c as es> <es, es,> <c' as es> |
  <as as,> <c as es> <bes bes,> <c c,> |
  <des des,> <f des as> <f des as> <c c,> |
  <des des,> <f des as> <bes, bes,> <b b,> |
  <c c,> <es c as> <es c as> <es, es,> |
  <as as,> <c as es> <es, es,> <c' as es> |
  <des, des,> <des des,> <bes bes,> <d d,> |
  <es es,> <c' as es> <es, es,> <e e,> |
  <f f,> <f f,> <g g,> <g g,> |
 } \alternative {
  { <as as,> <c as es> <bes bes,> <c c,> }
  { <as as,> <es es,> <as, as,> }
 }
 
 \bar "|."
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
