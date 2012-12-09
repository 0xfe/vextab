###
VexTab Tests
Copyright Mohit Cheppudira 2010 <mohit@muthanna.com>
###

Vex.Flow.Test = {} if _.isUndefined(Vex.Flow.Test)

class Vex.Flow.Test.VexTab
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

  @Start: ->
    module "VexTab Parser";
    test("Basic Test", @basic);
    test("Complex Test", @complex);
    test("Notation Only Test", @notationOnly);

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

  @notationOnly: ->
    tab = makeParser()

    tab.parse("tabstave notation=true")
    ok(true, "tabstave notation and tablature")

    tab.parse("tabstave\n notes :w 1/2 | 1/3 | 1/5 | 1/4")
    ok(true, "Simple stave with bars, notes and tabs.")

    tab.parse("tabstave notation=true tablature=false")
    ok(true, "tabstave just notation")

    tab.parse("tabstave\n notes :w 1/2 | 1/3 | 1/5 | 1/4")
    ok(true, "Simple stave with bars, notes and no tabs.")

    catchError(tab, "tabstave notation=false tablature=false")

    # CLEF TESTS
    clefs = ["treble", "alto", "tenor", "bass"]

    for clef in clefs
      tab.parse("tabstave notation=true clef=" + clef)
      ok(true, "Simple stave with " + clef + " clef")

      tab.parse("tabstave clef=" + clef)
      ok(true, "Simple stave with " + clef + " clef but notation off")

    catchError(tab, "tabstave clef=blah")

    # KEY SIGNATURE TESTS

    for key of Vex.Flow.keySignature.keySpecs
      tab.parse("tabstave key=" + key)
      ok(true, "Notation plus Key Signature for " + key)

      tab.parse("tabstave notation=true key=" + key)
      ok(true, "Notation plus Key Signature for " + key)

      tab.parse("tabstave notation=true tablature=true key=" + key)
      ok(true, "Notation plus Tablature plus Key Signature for " + key)

    catchError(tab, "tabstave notation=true key=rrr")

    # TIME SIGNATURE TESTS
    times = ["C", "C|", "2/4", "4/4", "100/4"]

    for time in times
      tab.parse("tabstave time=" + time)
      ok(true, "Notation plus Time Signature for " + time)

      tab.parse("tabstave notation=true time=" + time)
      ok(true, "Notation plus Time Signature for " + time)

      tab.parse("tabstave notation=true tablature=true time=" + time)
      ok(true, "Notation plus Tablature plus Time Signature for " + time)

    catchError(tab, "tabstave notation=true time=rrr")
    ok(true, "all pass");
