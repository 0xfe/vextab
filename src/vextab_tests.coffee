###
VexTab Tests
Copyright Mohit Cheppudira 2010 <mohit@muthanna.com>
###

Vex.Flow.Test = {} if _.isUndefined(Vex.Flow.Test)

class Vex.Flow.Test.VexTab
  @Start: ->
    module "VexTab Parser"
    test "Basic Test", @basic
    test "Complex Test", @complex
    test "Stave Options Test", @staveOptionsTest
    test "Notation Only Test", @notationOnly
    test "Tuning Test", @tuning

  # Private method
  catchError = (tab, code) ->
    error =
      code: "NoError"
      message: "Expected exception not caught"

    try
      tab.parse code
    catch e
      error = e

    equal(error.code, "ParseError", error.message)

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
    ok(true, "all pass");

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

    ok(true, "all pass");
