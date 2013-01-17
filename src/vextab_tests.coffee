###
VexTab Tests
Copyright Mohit Cheppudira 2010 <mohit@muthanna.com>
###

Vex.Flow.Test ?= {}

class Vex.Flow.Test.VexTab
  @Start: ->
    module "VexTab Parser"
    test "Basic Test", @basic
    test "Complex Test", @complex
    test "Stave Options Test", @staveOptionsTest
    test "Notation Only Test", @notationOnly
    test "Tuning Test", @tuning
    test "String/Fret Test", @stringFret
    test "MultiFret Test", @multiFret
    test "Tie Test", @tie
    test "Bar Test", @bar
    test "Bend Test", @bend
    test "Vibrato Test", @vibrato
    test "Upstroke/Downstroke Test", @strokes
    test "Chord Test", @chord
    test "Tapping Test", @tapping
    test "Chord Ties Test", @chordTies
    test "Duration Test", @duration
    test "Triplets and Tuplets Test", @tripletsAndTuplets
    test "Dotted Notes Test", @dottedNotes
    test "Annotations Test", @annotations
    test "Long Bends Test", @longBends
    test "Rest Test", @rest
    test "Options Test", @options
    test "ABC Notes Test", @abcNotes
    test "Rhythm/Slash Notation Test", @rhythmNotation
    test "Text Lines", @textLines
    test "Sweep Strokes", @sweepStrokes
    test "Voices", @voices
    test "Fingering and String Numbers", @fingering

  # Private method
  catchError = (tab, code, error_type="ParseError") ->
    error =
      code: "NoError"
      message: "Expected exception not caught"

    try
      tab.parse code
    catch e
      error = e

    equal(error.code, error_type, error.message)

  makeParser = -> new Vex.Flow.VexTab(new Vex.Flow.Artist(0, 0, 600))

  @basic: ->
    expect 3
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n")
    catchError tab, "tabstave\n notes /2 10/3"
    ok true, "all pass"

  @complex: ->
    expect 2
    tab = makeParser()
    code = """
    tabstave notation=true key=A
    notes :q (5/2.5/3.7/4) 5h6/3 7/4 |
    notes :8 [ t12p7p5h7/4 ] :q 7/5 :8 [ 3s5/5 ]
    notes :8 5-6-7v/4 (8-9-10/4.11s12/4)v

    tabstave notation=true
    notes :q (8/2.7b9b7/3) (5b6/2.5b6/3)v :8 [ 7s12/4 ]
    notes [ t:16:9-:8:3s:16:0/4 ]

    tabstave notation=true
    notes :q (5/4.5/5)s(7/4.7/5)s(5/4.5/5)
    notes :8 [ (5/4.5/5) (7/5) ] |
    notes :8 [ t(12/5.12/4)s(5/5.5/4) 3b4/5 ] :h 5V/6
    """

    notEqual null, tab.parse(code)
    catchError tab, "tabstave\n notes :q 5/L"

  @staveOptionsTest: ->
    expect 3
    tab = makeParser()
    notEqual null, tab.parse("tabstave notation=true key=C#")
    catchError(tab, "tabstave invalid=true")
    catchError(tab, "tabstave notation=boo")

  @notationOnly: ->
    expect 122
    tab = makeParser()

    notEqual null, tab.parse("tabstave notation=true")
    notEqual null, tab.parse("tabstave\n notes :w 1/2 | 1/3 | 1/5 | 1/4")
    notEqual null, tab.parse("tabstave notation=true tablature=false")
    notEqual null, tab.parse("tabstave\n notes :w 1/2 | 1/3 | 1/5 | 1/4")

    catchError(tab, "tabstave notation=false tablature=false")

    # CLEF TESTS
    clefs = ["treble", "alto", "tenor", "bass"]

    for clef in clefs
      notEqual null, tab.parse("tabstave notation=true clef=" + clef)
      notEqual null, tab.parse("tabstave clef=" + clef)

    catchError(tab, "tabstave clef=blah")

    # KEY SIGNATURE TESTS

    for key of Vex.Flow.keySignature.keySpecs
      notEqual null, tab.parse("tabstave key=" + key)
      notEqual null, tab.parse("tabstave notation=true key=" + key)
      notEqual null, tab.parse("tabstave notation=true tablature=true key=" + key)

    catchError(tab, "tabstave notation=true key=rrr")

    # TIME SIGNATURE TESTS
    times = ["C", "C|", "2/4", "4/4", "100/4"]

    for time in times
      notEqual null, tab.parse("tabstave time=" + time)
      notEqual null, tab.parse("tabstave notation=true time=" + time)
      notEqual null, tab.parse("tabstave notation=true tablature=true time=" + time)

    catchError(tab, "tabstave notation=true time=rrr")
    ok true, "all pass"

  @tuning: ->
    expect 9
    tab = makeParser()

    notEqual null, tab.parse("tabstave tuning=E/5,B/4,G/4,D/4,A/3,E/3")
    notEqual null, tab.parse("tabstave tuning=standard")
    notEqual null, tab.parse("tabstave tuning=eb")
    notEqual null, tab.parse("tabstave tuning=dropd")

    catchError(tab, "tabstave tuning=,B/4,G/4,D/4,A/3,E/3")
    catchError(tab, "tabstave tuning=/4,G/4,D/4,A/3,E/3")
    catchError(tab, "tabstave tuning=E,B,G,D,A,E")
    catchError(tab, "tabstave tuning=T/5,B/4,G/4,D/4,A/3,E/3")

    ok true, "all pass"

  @stringFret: ->
    expect 5
    tab = makeParser()

    notEqual null, tab.parse "tabstave\n notes 10/2 10/3"
    catchError(tab, "tabstave\n notes /2 10/3")
    catchError(tab, "tabstave\n notes j/2 10/3")
    catchError(tab, "tabstave\n notes 4")

    ok true, "all pass"

  @multiFret: ->
    expect 4
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes 10-11/3")
    notEqual null, tab.parse("tabstave\n notes 10-11-12-13-15/3 5-4-3-2-1/2")
    catchError(tab, "tabstave\n notes 10/2-10")
    catchError(tab, "tabstave\n notes 10-/2")

  @tie: ->
    expect 6
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes 10s11/3")
    notEqual null, tab.parse("tabstave\n notes 10s11h12p10/3")
    notEqual null, tab.parse("tabstave notation=true key=A\n notes :w 5/5 | T5/5 | T5V/5")
    catchError(tab, "tabstave\n notes 10/2s10")
    catchError(tab, "tabstave\n notes 10s")

    ok true, "all pass"

  @bar: ->
    expect 5
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes |10s11/3")
    notEqual null, tab.parse("tabstave\n notes 10s11h12p10/3|")
    notEqual null, tab.parse("tabstave notation=true key=A\n notes || :w || 5/5 ||| T5/5 | T5V/5")
    catchError(tab, "tabstave\n | notes 10/2s10")

    ok true, "all pass"


  @bend: ->
    expect 5
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes 10b11/3")
    notEqual null, tab.parse("tabstave\n notes 10b11s12/3")
    notEqual null, tab.parse("tabstave\n notes 10s11b12/3")
    catchError(tab, "tabstave\n notes 10b12b10b-/2")

    ok(true, "all pass");

  @vibrato: ->
    expect 10
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes 10v/3")
    notEqual null, tab.parse("tabstave\n notes 10-11v-12v/3")
    notEqual null, tab.parse("tabstave\n notes 10b11v-12/3")
    notEqual null, tab.parse("tabstave\n notes 10b11b10v-12/3")
    notEqual null, tab.parse("tabstave\n notes 10s11v-12/3")
    notEqual null, tab.parse("tabstave\n notes 10s11vs4s12vh15p10-1/2")
    catchError(tab, "tabstave\n notes 10v")
    catchError(tab, "tabstave\n notes 10vb/1")
    catchError(tab, "tabstave\n notes 10-b11/3")

    ok(true, "all pass")

  @strokes: ->
    expect 10
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes 10d/3")
    notEqual null, tab.parse("tabstave\n notes 10-11u-12d/3")
    notEqual null, tab.parse("tabstave\n notes 10b11u-12/3")
    notEqual null, tab.parse("tabstave\n notes 10b11b10d-12/3")
    notEqual null, tab.parse("tabstave\n notes 10s11d-12/3")
    notEqual null, tab.parse("tabstave\n notes 10s11us4s12vh15p10-1/2")
    notEqual null, tab.parse("tabstave\n notes (10/2.10/1)d")
    catchError(tab, "tabstave\n notes 10vb/1")
    catchError(tab, "tabstave\n notes 10-b11/3")

    ok(true, "all pass");

  @chord: ->
    expect 8
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes (4/6)")
    notEqual null, tab.parse("tabstave\n notes (4/5.6/6)")
    catchError tab, "tabstave\n notes (4/5.6/7)", "BadArguments"
    catchError tab, "tabstave\n notes (4"
    catchError tab, "tabstave\n notes (4/)"
    catchError tab, "tabstave\n notes (/5)"
    catchError tab, "tabstave\n notes (4/5.)"

    ok(true, "all pass")

  @tapping: ->
    expect 5
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes t5p4p3/3")
    notEqual null, tab.parse("tabstave\n notes 5t12p5-4-3/1")
    catchError(tab, "tabstave\n notes 5t/4")
    catchError(tab, "tabstave\n notes t-4-4h5/3")

    ok(true, "all pass")

  @chordTies: ->
    expect 7
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes (1/2.2/3)s(3/2.4/3)")
    notEqual null, tab.parse("tabstave\n notes (1/2.2/3.3/4)s(3/2.4/3.5/4)")
    notEqual null, tab.parse("tabstave\n notes (4/5.1/2.2/3)s(3/2.4/3)")
    notEqual null, tab.parse("tabstave\n notes (1/2.2/3)s(3/2.5/5.4/3)")
    notEqual null, tab.parse("tabstave\n notes (1/2.2/3)s(3/2.4/3)h(6/2.7/3)")
    notEqual null, tab.parse("tabstave\n notes t(1/2.2/3)s(3/2.4/3)h(6/2.7/3)")

    ok(true, "all pass")

  @duration: ->
    tab = makeParser()
    notEqual null, tab.parse("tabstave\n notes :w (1/2.2/3)s(3/2.4/3)")
    notEqual null, tab.parse("tabstave\n notes :h (1/2.2/3)s(3/2.4/3) :q 1/2")
    notEqual null, tab.parse("tabstave\n notes :h (1/2.2/3)s(3/2.4/3) 1/2 ^3^")
    catchError(tab, "tabstave notation=true\n notes :w (1/2.2/3)s(3/2.4/3) ^3^", "ArtistError")
    ok(true, "all pass")

  @tripletsAndTuplets: ->
    expect 1
    tab = makeParser()
    code = """
    tabstave notation=true key=Ab tuning=eb
    notes :8 5s7s8/5 ^3^ :16 (5/2.6/3) 7-12-15s21/3 ^5^
    tabstave notation=true key=Ab tuning=eb
    notes :8 5h7s9-12s15p12h15/5 ^7^ | :q 5-7-8/5 ^3^
    """
    notEqual null, tab.parse(code)

  @dottedNotes: ->
    expect 1
    tab = makeParser()
    code = """
    tabstave notation=true time=4/4 key=Ab tuning=eb
    notes :8d 5/4 :16 5/5 :8d 5/4 :16 5/5 :8d 5/4 :16 5/5 :q 5v/5
    """
    notEqual null, tab.parse(code)

  @annotations: ->
    expect 1
    tab = makeParser()
    code = """
    tabstave notation=true time=4/4 key=Ab tuning=eb
    notes :q 5/5 5/4 5/3 ^3^ $Fi,Ga,Ro!$ :h 4/4 $Blah!$

    tabstave notation=true key=A
    notes :q (5/2.5/3.7/4) $.big.A7#9$ 5h6/3 7/4 |
    notes :8 7/4 $.italic.sweep$ 6/3 5/2 3v/1 :q 7v/5 $.Arial-10-bold.P.H$ :8 3s5/5
    """
    notEqual null, tab.parse(code)

  @longBends: ->
    expect 1
    tab = makeParser()
    code = """
    tabstave notation=true key=A
    notes :8 7b9b7b9b7s12b14b12s7s5s2/3
    """
    notEqual null, tab.parse(code)

  @rest: ->
    expect 1
    tab = makeParser()
    code = """
    tabstave notation=true key=A
    notes :8 ## 7b9b7b9b7s12b14b12s7s5s2/3 #0# 4/4 #9# 5/5
    """
    notEqual null, tab.parse(code)

  @options: ->
    expect 8
    tab = makeParser()

    notEqual null, tab.parse("options width=400\ntabstave\n")
    notEqual null, tab.parse("options font-face=Arial\ntabstave\n")
    notEqual null, tab.parse("options font-size=10\ntabstave\n")
    notEqual null, tab.parse("options font-style=italic\ntabstave\n")
    notEqual null, tab.parse("options space=40\ntabstave\n")
    notEqual null, tab.parse("options stave-distance=40\ntabstave\n")
    catchError tab, "options w=40\ntabstave\n notes /2 10/3"
    ok true, "all pass"

  @abcNotes: ->
    expect 6
    tab = makeParser()

    notEqual null, tab.parse("tabstave notation=true\n notes A/5 C-D-E/5")
    notEqual null, tab.parse("tabstave\n notes :q A/5 C-D-:h:E/5")
    notEqual null, tab.parse("tabstave\n notes :q (A/5.A/4)T(A/5.A/4)")
    notEqual null, tab.parse("tabstave notation=true tablature=false\n notes A#/5 C##-D@@-E/5")
    notEqual null, tab.parse("tabstave\n notes An/5 C-D@-E/5")

    ok(true, "all pass")

  @rhythmNotation: ->
    expect 4
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes :qS A/5 C-D-:h:E/5")
    notEqual null, tab.parse("tabstave notation=true\n notes :16S (A/5.A/4)T(A/5.A/4)")
    notEqual null, tab.parse("tabstave notation=true tablature=false\n notes :qS X/5 C-D-:h:E/5")

    ok(true, "all pass")

  @textLines: ->
    expect 6
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes :qS A/5 C-D-:h:E/5")
    notEqual null, tab.parse("tabstave\n text .4, Blah, :16, Boo")
    notEqual null, tab.parse("tabstave notation=true\n text .4, Blah, :16, Boo")
    notEqual null, tab.parse("tabstave notation=true\n text .4, Blah,++, :16, Boo")
    notEqual null, tab.parse("tabstave notation=true\n text .4, .strict, Blah,++, :16, .smooth, Boo")

    ok(true, "all pass")

  @sweepStrokes: ->
    expect 8
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/rd.$")
    notEqual null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/ru.$")
    notEqual null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/bu.$")
    notEqual null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/bd.$")
    notEqual null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/qu.$")
    notEqual null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/qd.$")
    catchError tab, "tabstave\n notes :q (5/2.5/3.7/4) $.stroke/xd.$", "ArtistError"

    ok(true, "all pass")

  @voices: ->
    expect 1
    tab = makeParser()
    code = """
    options stave-distance=30
    tabstave notation=true
             key=A
             time=4/4
    voice
        notes :q (5/2.5/3.7/4) :8 7p5h6/3 ^3^ 5h6h7/5 ^3^ :q 7V/4 |
        notes :8 t12p7/4 s5s3/4 :8 3s:16:5-7/5 :q p5/4
    voice
        notes :h 5/6 :q 5/6 :8 4-5/5 | :w 5/5
    """
    notEqual null, tab.parse(code)

  @fingering: ->
    expect 7
    tab = makeParser()

    notEqual null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:r:s:1.$")
    notEqual null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:l:f:1.$")
    notEqual null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:a:s:1.$")
    notEqual null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:b:s:1.$")
    notEqual null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:l:f:1.$")
    notEqual null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:r:s:1.$")

    ok(true, "all pass")
