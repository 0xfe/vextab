% Test-only LilyPond 2.26 observer. Capture exact source pitches and time before graphical layout.
#(define (m5-record engraver event rest?)
  (let* ((ctx (ly:translator-context engraver))
         (staff (ly:context-id (ly:context-find ctx 'Staff)))
         (at (ly:moment-main (ly:context-current-moment ctx)))
         (duration (ly:moment-main (ly:duration->moment (ly:event-property event 'duration))))
         (p (ly:event-property event 'pitch))
         (name (if rest? "rest"
                   (format #f "~a,~a,~a" (ly:pitch-notename p) (* 2 (ly:pitch-alteration p)) (+ 4 (ly:pitch-octave p))))))
    (format #t "M5\t~a\t~a\t~a\t~a\n" staff at duration name)))
\layout {
  \context {
    \Voice
    \consists #(lambda (context)
      (make-engraver
        (listeners
          ((note-event engraver event) (m5-record engraver event #f))
          ((rest-event engraver event) (m5-record engraver event #t)))))
  }
}

