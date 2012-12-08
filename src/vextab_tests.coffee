###
VexTab Tests
Copyright Mohit Cheppudira 2010 <mohit@muthanna.com>
###

Vex.Flow.Test = {}

class Vex.Flow.Test.VexTab
  @Start: ->
    module "VexTab Parser";
    test("Basic Test", @basic);
    test("Notation Only Test", @notationOnly);

  @catchError: (tab, code) ->
    error =
      code: "NoError"
      message: "Expected exception not caught"

    try
      tab.parse code
    catch e
      error = e

    equal(error.code, "ParseError", error.message)

  @makeParser: -> new Vex.Flow.VexTab(new Vex.Flow.Artist(0, 0, 600))

  @basic: ->
    expect 3
    tab = Vex.Flow.Test.VexTab.makeParser()

    equal true, tab.parse("tabstave\n")
    Vex.Flow.Test.VexTab.catchError tab, "tabstave\n notes /2 10/3"
    ok true, "all pass"

  @notationOnly: ->
    tab = Vex.Flow.Test.VexTab.makeParser()

    tab.parse("tabstave notation=true")
    ok(true, "tabstave notation and tablature")

    tab.parse("tabstave\n notes :w 1/2 | 1/3 | 1/5 | 1/4")
    ok(true, "Simple stave with bars, notes and tabs.")

    tab.parse("tabstave notation=true tablature=false")
    ok(true, "tabstave just notation")

    tab.parse("tabstave\n notes :w 1/2 | 1/3 | 1/5 | 1/4")
    ok(true, "Simple stave with bars, notes and no tabs.")

    Vex.Flow.Test.VexTab.catchError(tab, "tabstave notation=false tablature=false")

    # CLEF TESTS
    clefs = ["treble", "alto", "tenor", "bass"]

    for clef in clefs
      tab.parse("tabstave notation=true clef=" + clef)
      ok(true, "Simple stave with " + clef + " clef")

      tab.parse("tabstave clef=" + clef)
      ok(true, "Simple stave with " + clef + " clef but notation off")

    Vex.Flow.Test.VexTab.catchError(tab, "tabstave clef=blah")

    # KEY SIGNATURE TESTS

    for key of Vex.Flow.keySignature.keySpecs
      tab.parse("tabstave key=" + key)
      ok(true, "Notation plus Key Signature for " + key)

      tab.parse("tabstave notation=true key=" + key)
      ok(true, "Notation plus Key Signature for " + key)

      tab.parse("tabstave notation=true tablature=true key=" + key)
      ok(true, "Notation plus Tablature plus Key Signature for " + key)

    Vex.Flow.Test.VexTab.catchError(tab, "tabstave notation=true key=rrr")

    # TIME SIGNATURE TESTS
    times = ["C", "C|", "2/4", "4/4", "100/4"]

    for time in times
      tab.parse("tabstave time=" + time)
      ok(true, "Notation plus Time Signature for " + time)

      tab.parse("tabstave notation=true time=" + time)
      ok(true, "Notation plus Time Signature for " + time)

      tab.parse("tabstave notation=true tablature=true time=" + time)
      ok(true, "Notation plus Tablature plus Time Signature for " + time)

    Vex.Flow.Test.VexTab.catchError(tab, "tabstave notation=true time=rrr")
    ok(true, "all pass");
