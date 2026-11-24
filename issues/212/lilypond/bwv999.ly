\header {
	title =		"Prelude"
	composer =	"J.S. Bach (1685-1750)"
	opus =		"BWV 999"
	% instrument =	"Guitar"

	% Mutopia file info:

	mutopiatitle =	"Prelude in D Minor"
	mutopiacomposer =	"BachJS"
	mutopiaopus =	"BWV 999"
	mutopiainstrument =	"Lute, Guitar"
	style =		"Baroque"
	copyright =	"Public Domain"
	source =	"Unknown"
	filename =	"Bach_Prelude_BWV999.ly"
	enteredby =	"Jakob Bagterp"
	maintainer =	"Jakob Bagterp"
	maintainerEmail =	"jakob_bagterp@hotmail.com"

 footer = "Mutopia-2013/01/22-60"
 tagline = \markup { \override #'(box-padding . 1.0) \override #'(baseline-skip . 2.7) \box \center-column { \small \line { Sheet music from \with-url #"http://www.MutopiaProject.org" \line { \concat { \teeny www. \normalsize MutopiaProject \teeny .org } \hspace #0.5 } • \hspace #0.5 \italic Free to download, with the \italic freedom to distribute, modify and perform. } \line { \small \line { Typeset using \with-url #"http://www.LilyPond.org" \line { \concat { \teeny www. \normalsize LilyPond \teeny .org }} by \concat { \maintainer . } \hspace #0.5 Reference: \footer } } \line { \teeny \line { This sheet music has been placed in the public domain by the typesetter, for details \concat { see: \hspace #0.3 \with-url #"http://creativecommons.org/licenses/publicdomain" http://creativecommons.org/licenses/publicdomain } } } } }
}

% This version of the Prelude hasn't been fingered yet --- it will soon be done. \Jakob Bagterp

\version "2.16.1"
#(set-global-staff-size 20)
\include "deutsch.ly"

global =  {
	\clef "treble_8"
	\key d \minor
	\time 3/4
}

melody =  \relative c' {
	\global
	\voiceOne

	% 1
	r16 d f a f d f d r d r d |
	r d f a f d f d r d r d |
	r d g b g d g d r d r d |
	r d g b g d g d r d r d |

	% 5
	r cis e g e cis e cis r cis r cis |
	r cis e g e cis e cis r cis r cis |
	r a d f d a d a r a r a |
	r a d f d a d a r a r a |
	r a d f d a d a r a r a |

	% 10
	r a d f d a d a r a r a |
	r h d f d h d h r h r h |
	r h d f d h d h r h r h |
	r h c e c h c h r h r h |
	r a c e c a c a r a r a |

	% 15
	r c e a e c e c r c r c |
	r h f' a f h, f' h, r h r h |
	r h d gis d h d h r h r h |
	r h d gis d h d h r h r h |
	r c e a e c e c r c r c |

	% 20
	r d gis h gis d gis d r d r d |
	r e a c a e a e r e r e |
	r e gis d' gis, e gis e r e r e |
	r dis a' c a dis, a' dis, r dis r dis |
	r d! f h f d f d r d r d |

	% 25
	r c fis a fis c fis c r c r c |
	r h d a' d, h d h r h r h |
	r h d gis d h d h r h r h |
	r a c fis c a c a r a r a |
	r gis h f'! h, gis h gis r gis r gis |

	% 30
	r a c e c a c a r a r a |
	r a h d h a h a r a r a |
	r gis h d h gis h gis r gis r gis |
	r gis h d h gis h gis r gis r gis |
	r a h d cis a cis a r a r a |

	% 35
	r h d gis d h d h r h r h |
	r d gis h gis d gis d r d r d |
	r cis e a e cis e cis r cis r cis |
	r cis e g e cis e cis r cis r cis |
	r a d f d a d a r a r a |

	% 40
	r gis d' f d gis, d' gis, r gis r gis |
	r gis d' f d gis, d' gis, r gis r gis |
	r a cis e cis a cis e f d h gis' |
	<a, cis a'>4^\fermata r r \bar "|."
}

bass =  \relative c {
	\global
	\voiceTwo

	% 1
	d4 r a'8 f |
	d4 r a'8 f |
	d4 r b'8 g |
	d4 r b'8 g |

	% 5
	d4 r b'8 g |
	d4 r b'8 g |
	d4 r f8 d |
	c4 r f8 d |
	b4 r f'8 d |

	% 10
	a4 r f'8 d |
	gis,4 r f'8 d |
	gis,4 r gis'8 e |
	a,4 r e'8 c |
	a4 r c8 a |

	% 15
	f4 r a'8 f |
	d4 r d8 h |
	e,4 r e'8 h |
	e,4 r e'8 h |
	e,4 r e'8 c |

	% 20
	e,4 r f'8 d |
	e,4 r a'8 e |
	e,4 r h''8 gis |
	e,4 r a'8 f |
	e,4 r gis'8 e |

	% 25
	e,4 r fis'8 dis |
	e,4 r f'!8 d! |
	e,4 r e'8 h |
	e,4 r dis'8 c |
	e,4 r d'!8 h |

	% 30
	e,4 r c'8 a |
	e4 r f'8 d |
	e,4 r e'8 h |
	a4 r f'8 d |
	a4 r e'8 cis |

	% 35
	a4 r f'8 d |
	a4 r f'8 d |
	a4 r a'8 e |
	a,4 r b'8 g |
	a,4 r f'8 d |

	% 40
	a4 r f'8 d |
	a4 r f'8 d |
	a4 r r |
	<a e'>4_\fermata r r |
}

GuitarStaff = \context Staff <<
	\set Staff.midiInstrument = "acoustic guitar (nylon)"
	% \transposition c 

	\melody
	\bass
>>

\score {
	\GuitarStaff

	
  \midi {
    \tempo 4 = 80
    }



	\layout {
	}
}
