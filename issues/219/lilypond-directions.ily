% Observe the final stem and tie directions while the four voices share their original staves.
#(define (pitched-stem? grob)
   (let ((heads (ly:grob-object grob 'note-heads)))
     (and (ly:grob-array? heads) (> (ly:grob-array-length heads) 0))))

#(define (observe-direction context grob kind)
   ;; Capture the original voice and onset before line breaking creates any fragments.
   (let ((voice (ly:context-id context))
         (onset (ly:moment-main (ly:context-current-moment context))))
     (ly:grob-set-property! grob 'after-line-breaking
       (lambda (fragment)
         (if (or (eq? kind 'tie) (pitched-stem? fragment))
           (format #t "M6DIR\t~a\t~a\t~a\t~a\t~a\n"
             voice onset kind (ly:grob-property fragment 'direction)
             (ly:grob-property fragment 'duration-log 0)))))))

#(define (direction-engraver context)
   (make-engraver
     (acknowledgers
       ((stem-interface engraver grob source) (observe-direction context grob 'stem))
       ((tie-interface engraver grob source) (observe-direction context grob 'tie)))))

\layout {
  \context { \Voice \consists #direction-engraver }
}
