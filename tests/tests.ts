/*
tests/tests.ts
QUnit-based regression suite for VexTab parsing + rendering behavior.
Copyright Mohit Cheppudira 2010 <mohit@muthanna.com>
*/

var VexTabTests, qunit, test; // Module globals for the test harness.

import Vex from '../src/vexflow'; // VexFlow shim used by tests.
import Artist from '../src/artist'; // Artist renderer used by tests.
import VexTab from '../src/vextab'; // VexTab parser under test.

qunit = QUnit; // QUnit global injected by tests.html.
test = qunit.test; // Alias for convenience.

console.log(test); // Surface QUnit test function for debugging.

Artist.DEBUG = false; // Disable verbose logging in tests.
VexTab.DEBUG = false; // Disable verbose logging in tests.

VexTabTests = (function() {
  // Helper functions and state used across test cases.
  var assertEquivalent, catchError, getRenderedContent, idcounter, makeParser, makeRenderer, renderTest;

  /**
   * Collection of static QUnit test cases for VexTab.
   */
  class VexTabTests {
    /**
     * Register all VexTab tests with QUnit.
     */
    static Start() {
      qunit.module("VexTab Parser");
      test("Basic Test", this.basic);
      test("Complex Test", this.complex);
      test("Stave Options Test", this.staveOptionsTest);
      test("Notation Only Test", this.notationOnly);
      test("Tuning Test", this.tuning);
      test("String/Fret Test", this.stringFret);
      test("MultiFret Test", this.multiFret);
      test("Tie Test", this.tie);
      test("Bar Test", this.bar);
      test("Bend Test", this.bend);
      test("Vibrato Test", this.vibrato);
      test("Upstroke/Downstroke Test", this.strokes);
      test("Chord Test", this.chord);
      test("Tapping Test", this.tapping);
      test("Chord Ties Test", this.chordTies);
      test("Duration Test", this.duration);
      test("Triplets and Tuplets Test", this.tripletsAndTuplets);
      test("Dotted Notes Test", this.dottedNotes);
      test("Annotations Test", this.annotations);
      test("Long Bends Test", this.longBends);
      test("Rest Test", this.rest);
      test("Options Test", this.options);
      test("ABC Notes Test", this.abcNotes);
      test("ABC Notes with Frets Test", this.abcNotesWithFrets);
      test("Rhythm/Slash Notation Test", this.rhythmNotation);
      test("Text Lines", this.textLines);
      test("Sweep Strokes", this.sweepStrokes);
      test("Voices", this.voices);
      test("Fingering and String Numbers", this.fingering);
      test("Render", this.render);
      test("Render Complex", this.renderComplex);
      test("Tab Stems", this.tabStems);
      test("Rests in Tab", this.restsInTab);
      test("Multi String Tab", this.multiStringTab);
      test("Time Signature based Beaming", this.timeSigBeaming);
      test("Override Fret-Note", this.overrideFretNote);
      test("Mixed Tuplets", this.mixedTuplets);
      test("Accidental Strategies", this.accidentalStrategies);
      return test("Fret-hand Fingering and String Numbers", this.fingeringAndStrings);
    }

    /**
     * Basic parser smoke test and error handling.
     */
    static basic(assert) {
      var tab;
      assert.expect(3);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n"));
      catchError(assert, tab, "tabstave\n notes /2 10/3");
      return assert.ok(true, "all pass");
    }

    /**
     * Complex multi-stave parse with bends, ties, and tuplets.
     */
    static complex(assert) {
      var code, tab;
      assert.expect(2);
      tab = makeParser();
      code = `tabstave notation=true key=A
notes :q (5/2.5/3.7/4) 5h6/3 7/4 |
notes :8 [ t12p7p5h7/4 ] :q 7/5 :8 [ 3s5/5 ]
notes :8 5-6-7v/4 (8-9-10/4.11s12/4)v

tabstave notation=true
notes :q (8/2.7b9b7/3) (5b6/2.5b6/3)v :8 [ 7s12/4 ]
notes [ t:16:9-:8:3s:16:0/4 ]

tabstave notation=true
notes :q (5/4.5/5)s(7/4.7/5)s(5/4.5/5)
notes :8 [ (5/4.5/5) (7/5) ] |
notes :8 [ t(12/5.12/4)s(5/5.5/4) 3b4/5 ] :h 5V/6`;
      assert.notEqual(null, tab.parse(code));
      return catchError(assert, tab, "tabstave\n notes :q 5/L");
    }

    /**
     * Validate stave options parsing and error reporting.
     */
    static staveOptionsTest(assert) {
      var tab;
      assert.expect(3);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave notation=true key=C#"));
      catchError(assert, tab, "tabstave invalid=true");
      return catchError(assert, tab, "tabstave notation=boo");
    }

    /**
     * Ensure notation-only staves respect clef, key, and time validation.
     */
    static notationOnly(assert) {
      var clef, clefs, expected, i, j, k, key, keySignatures, len, len1, len2, ref, tab, time, times;
      clefs = ["treble", "alto", "tenor", "bass"];
      times = ["C", "C|", "2/4", "4/4", "100/4"];
      keySignatures = [
        "C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb",
        "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm"
      ];
      if (((ref = Vex.Flow) != null ? ref.hasKeySignature : void 0) != null) {
        keySignatures = (function() {
          var i, len, results;
          results = [];
          for (i = 0, len = keySignatures.length; i < len; i++) {
            key = keySignatures[i];
            if (Vex.Flow.hasKeySignature(key)) {
              results.push(key);
            }
          }
          return results;
        })();
      }
      expected = 4 + 1 + (clefs.length * 2) + 1 + (keySignatures.length * 3) + 1 + (times.length * 3) + 1 + 1; // initial parse calls // invalid notation+tablature // clef tests // invalid clef // key signature tests // invalid key // time signature tests // invalid time // final ok
      assert.expect(expected);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave notation=true"));
      assert.notEqual(null, tab.parse("tabstave\n notes :w 1/2 | 1/3 | 1/5 | 1/4"));
      assert.notEqual(null, tab.parse("tabstave notation=true tablature=false"));
      assert.notEqual(null, tab.parse("tabstave\n notes :w 1/2 | 1/3 | 1/5 | 1/4"));
      catchError(assert, tab, "tabstave notation=false tablature=false");
      tab = makeParser();
// CLEF TESTS
      for (i = 0, len = clefs.length; i < len; i++) {
        clef = clefs[i];
        assert.notEqual(null, tab.parse("tabstave notation=true clef=" + clef));
        assert.notEqual(null, tab.parse("tabstave clef=" + clef));
      }
      catchError(assert, tab, "tabstave clef=blah");
// KEY SIGNATURE TESTS
      for (j = 0, len1 = keySignatures.length; j < len1; j++) {
        key = keySignatures[j];
        assert.notEqual(null, tab.parse("tabstave key=" + key));
        assert.notEqual(null, tab.parse("tabstave notation=true key=" + key));
        assert.notEqual(null, tab.parse("tabstave notation=true tablature=true key=" + key));
      }
      catchError(assert, tab, "tabstave notation=true key=rrr");
// TIME SIGNATURE TESTS
      for (k = 0, len2 = times.length; k < len2; k++) {
        time = times[k];
        assert.notEqual(null, tab.parse("tabstave time=" + time));
        assert.notEqual(null, tab.parse("tabstave notation=true time=" + time));
        assert.notEqual(null, tab.parse("tabstave notation=true tablature=true time=" + time));
      }
      catchError(assert, tab, "tabstave notation=true time=rrr");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate tuning option parsing and error cases.
     */
    static tuning(assert) {
      var tab;
      assert.expect(9);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave tuning=E/5,B/4,G/4,D/4,A/3,E/3"));
      assert.notEqual(null, tab.parse("tabstave tuning=standard"));
      assert.notEqual(null, tab.parse("tabstave tuning=eb"));
      assert.notEqual(null, tab.parse("tabstave tuning=dropd"));
      catchError(assert, tab, "tabstave tuning=,B/4,G/4,D/4,A/3,E/3");
      catchError(assert, tab, "tabstave tuning=/4,G/4,D/4,A/3,E/3");
      catchError(assert, tab, "tabstave tuning=E,B,G,D,A,E");
      catchError(assert, tab, "tabstave tuning=T/5,B/4,G/4,D/4,A/3,E/3");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate basic string/fret note parsing.
     */
    static stringFret(assert) {
      var tab;
      assert.expect(5);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes 10/2 10/3"));
      catchError(assert, tab, "tabstave\n notes /2 10/3");
      catchError(assert, tab, "tabstave\n notes j/2 10/3");
      catchError(assert, tab, "tabstave\n notes 4");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate multi-fret notation parsing.
     */
    static multiFret(assert) {
      var tab;
      assert.expect(4);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes 10-11/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10-11-12-13-15/3 5-4-3-2-1/2"));
      catchError(assert, tab, "tabstave\n notes 10/2-10");
      return catchError(assert, tab, "tabstave\n notes 10-/2");
    }

    /**
     * Validate tie and hammer/pull parsing.
     */
    static tie(assert) {
      var tab;
      assert.expect(6);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes 10s11/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10s11h12p10/3"));
      assert.notEqual(null, tab.parse("tabstave notation=true key=A\n notes :w 5/5 | T5/5 | T5V/5"));
      catchError(assert, tab, "tabstave\n notes 10/2s10");
      catchError(assert, tab, "tabstave\n notes 10s");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate barline parsing and placement.
     */
    static bar(assert) {
      var code, tab;
      assert.expect(7);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes |10s11/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10s11h12p10/3|"));
      assert.notEqual(null, tab.parse("tabstave notation=true key=A\n notes || :w || 5/5 ||| T5/5 | T5V/5"));
      catchError(assert, tab, "tabstave\n | notes 10/2s10");
      code = `tabstave notation=true key=E time=12/8
notes :w 7/4 | :w 6/5`;
      assertEquivalent(assert, "Sole notes line ends with bar", code, code + " |");
      code = `tabstave notation=true key=E time=12/8
notes :w 7/4 |
notes :w 6/5`;
      assertEquivalent(assert, "Last notes line ends with bar", code, code + " |");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate bend parsing and bend notation.
     */
    static bend(assert) {
      var tab;
      assert.expect(5);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes 10b11/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10b11s12/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10s11b12/3"));
      catchError(assert, tab, "tabstave\n notes 10b12b10b-/2");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate vibrato decorator parsing.
     */
    static vibrato(assert) {
      var tab;
      assert.expect(10);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes 10v/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10-11v-12v/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10b11v-12/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10b11b10v-12/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10s11v-12/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10s11vs4s12vh15p10-1/2"));
      catchError(assert, tab, "tabstave\n notes 10v");
      catchError(assert, tab, "tabstave\n notes 10vb/1");
      catchError(assert, tab, "tabstave\n notes 10-b11/3");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate upstroke/downstroke annotations.
     */
    static strokes(assert) {
      var tab;
      assert.expect(10);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes 10d/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10-11u-12d/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10b11u-12/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10b11b10d-12/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10s11d-12/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10s11us4s12vh15p10-1/2"));
      assert.notEqual(null, tab.parse("tabstave\n notes (10/2.10/1)d"));
      catchError(assert, tab, "tabstave\n notes 10vb/1");
      catchError(assert, tab, "tabstave\n notes 10-b11/3");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate chord parsing and multi-note group handling.
     */
    static chord(assert) {
      var tab;
      assert.expect(8);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes (4/6)"));
      assert.notEqual(null, tab.parse("tabstave\n notes (4/5.6/6)"));
      catchError(assert, tab, "tabstave\n notes (4/5.6/7)", "BadArguments");
      catchError(assert, tab, "tabstave\n notes (4");
      catchError(assert, tab, "tabstave\n notes (4/)");
      catchError(assert, tab, "tabstave\n notes (/5)");
      catchError(assert, tab, "tabstave\n notes (4/5.)");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate tapping annotation parsing.
     */
    static tapping(assert) {
      var tab;
      assert.expect(5);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes t5p4p3/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 5t12p5-4-3/1"));
      catchError(assert, tab, "tabstave\n notes 5t/4");
      catchError(assert, tab, "tabstave\n notes t-4-4h5/3");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate tie behavior across chord notes.
     */
    static chordTies(assert) {
      var tab;
      assert.expect(7);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes (1/2.2/3)s(3/2.4/3)"));
      assert.notEqual(null, tab.parse("tabstave\n notes (1/2.2/3.3/4)s(3/2.4/3.5/4)"));
      assert.notEqual(null, tab.parse("tabstave\n notes (4/5.1/2.2/3)s(3/2.4/3)"));
      assert.notEqual(null, tab.parse("tabstave\n notes (1/2.2/3)s(3/2.5/5.4/3)"));
      assert.notEqual(null, tab.parse("tabstave\n notes (1/2.2/3)s(3/2.4/3)h(6/2.7/3)"));
      assert.notEqual(null, tab.parse("tabstave\n notes t(1/2.2/3)s(3/2.4/3)h(6/2.7/3)"));
      return assert.ok(true, "all pass");
    }

    /**
     * Validate duration parsing and duration changes.
     */
    static duration(assert) {
      var tab;
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes :w (1/2.2/3)s(3/2.4/3)"));
      assert.notEqual(null, tab.parse("tabstave\n notes :h (1/2.2/3)s(3/2.4/3) :q 1/2"));
      assert.notEqual(null, tab.parse("tabstave\n notes :h (1/2.2/3)s(3/2.4/3) 1/2 ^3^"));
      catchError(assert, tab, "tabstave notation=true\n notes :w (1/2.2/3)s(3/2.4/3) ^3^", "ArtistError");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate triplet/tuplet parsing and note grouping.
     */
    static tripletsAndTuplets(assert) {
      var code, tab;
      assert.expect(1);
      tab = makeParser();
      code = `tabstave notation=true key=Ab tuning=eb
notes :8 5s7s8/5 ^3^ :16 (5/2.6/3) 7-12-15s21/3 ^5^
tabstave notation=true key=Ab tuning=eb
notes :8 5h7s9-12s15p12h15/5 ^7^ | :q 5-7-8/5 ^3^`;
      return assert.notEqual(null, tab.parse(code));
    }

    /**
     * Validate dotted duration parsing.
     */
    static dottedNotes(assert) {
      var code, tab;
      assert.expect(1);
      tab = makeParser();
      code = `tabstave notation=true time=4/4 key=Ab tuning=eb
notes :8d 5/4 :16 5/5 :8d 5/4 :16 5/5 :8d 5/4 :16 5/5 :q 5v/5`;
      return assert.notEqual(null, tab.parse(code));
    }

    /**
     * Validate general annotation parsing and placement.
     */
    static annotations(assert) {
      var code, tab;
      assert.expect(1);
      tab = makeParser();
      code = `tabstave notation=true time=4/4 key=Ab tuning=eb
notes :q 5/5 5/4 5/3 ^3^ $Fi,Ga,Ro!$ :h 4/4 $Blah!$

tabstave notation=true key=A
notes :q (5/2.5/3.7/4) $.big.A7#9$ 5h6/3 7/4 |
notes :8 7/4 $.italic.sweep$ 6/3 5/2 3v/1 :q 7v/5 $.Arial-10-bold.P.H$ :8 3s5/5`;
      return assert.notEqual(null, tab.parse(code));
    }

    /**
     * Validate long bend phrase parsing across multiple notes.
     */
    static longBends(assert) {
      var code, tab;
      assert.expect(1);
      tab = makeParser();
      code = `tabstave notation=true key=A
notes :8 7b9b7b9b7s12b14b12s7s5s2/3`;
      return assert.notEqual(null, tab.parse(code));
    }

    /**
     * Validate rest parsing in tab and notation.
     */
    static rest(assert) {
      var code, tab;
      assert.expect(1);
      tab = makeParser();
      code = `tabstave notation=true key=A
notes :8 ## 7b9b7b9b7s12b14b12s7s5s2/3 #0# 4/4 #9# 5/5`;
      return assert.notEqual(null, tab.parse(code));
    }

    /**
     * Validate global options parsing.
     */
    static options(assert) {
      var tab;
      assert.expect(8);
      tab = makeParser();
      assert.notEqual(null, tab.parse("options width=400\ntabstave\n"));
      assert.notEqual(null, tab.parse("options font-face=Arial\ntabstave\n"));
      assert.notEqual(null, tab.parse("options font-size=10\ntabstave\n"));
      assert.notEqual(null, tab.parse("options font-style=italic\ntabstave\n"));
      assert.notEqual(null, tab.parse("options space=40\ntabstave\n"));
      assert.notEqual(null, tab.parse("options stave-distance=40\ntabstave\n"));
      catchError(assert, tab, "options w=40\ntabstave\n notes /2 10/3");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate ABC note parsing.
     */
    static abcNotes(assert) {
      var tab;
      assert.expect(6);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave notation=true\n notes A/5 C-D-E/5"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q A/5 C-D-:h:E/5"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (A/5.A/4)T(A/5.A/4)"));
      assert.notEqual(null, tab.parse("tabstave notation=true tablature=false\n notes A#/5 C##-D@@-E/5"));
      assert.notEqual(null, tab.parse("tabstave\n notes An/5 C-D@-E/5"));
      return assert.ok(true, "all pass");
    }

    /**
     * Validate ABC notes combined with fret notation.
     */
    static abcNotesWithFrets(assert) {
      var tab;
      assert.expect(6);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave notation=true\n notes A5_5/5 Cn~4_4-5-6/5"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q A/5 C-D-:h:A4_6/5"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (E@2_6/5.A/4)T(A/5.A/4)"));
      assert.notEqual(null, tab.parse("tabstave notation=true tablature=false\n notes A#3_4/5 C##-D@@-E/5"));
      assert.notEqual(null, tab.parse("tabstave\n notes A@~3_6/5 C-D@-E/5"));
      return assert.ok(true, "all pass");
    }

    /**
     * Validate rhythm and slash notation parsing.
     */
    static rhythmNotation(assert) {
      var tab;
      assert.expect(4);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes :qS A/5 C-D-:h:E/5"));
      assert.notEqual(null, tab.parse("tabstave notation=true\n notes :16S (A/5.A/4)T(A/5.A/4)"));
      assert.notEqual(null, tab.parse("tabstave notation=true tablature=false\n notes :qS X/5 C-D-:h:E/5"));
      return assert.ok(true, "all pass");
    }

    /**
     * Validate text line parsing (lyrics/annotations).
     */
    static textLines(assert) {
      var tab;
      assert.expect(6);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes :qS A/5 C-D-:h:E/5"));
      assert.notEqual(null, tab.parse("tabstave\n text .4, Blah, :16, Boo"));
      assert.notEqual(null, tab.parse("tabstave notation=true\n text .4, Blah, :16, Boo"));
      assert.notEqual(null, tab.parse("tabstave notation=true\n text .4, Blah,++, :16, Boo"));
      assert.notEqual(null, tab.parse("tabstave notation=true\n text .4, .strict, Blah,++, :16, .smooth, Boo"));
      return assert.ok(true, "all pass");
    }

    /**
     * Validate sweep stroke parsing.
     */
    static sweepStrokes(assert) {
      var tab;
      assert.expect(8);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/rd.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/ru.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/bu.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/bd.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/qu.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/qd.$"));
      catchError(assert, tab, "tabstave\n notes :q (5/2.5/3.7/4) $.stroke/xd.$", "ArtistError");
      return assert.ok(true, "all pass");
    }

    /**
     * Validate multi-voice parsing and rendering.
     */
    static voices(assert) {
      var code, tab;
      assert.expect(1);
      tab = makeParser();
      code = `options stave-distance=30
tabstave notation=true
         key=A
         time=4/4
voice
    notes :q (5/2.5/3.7/4) :8 7p5h6/3 ^3^ 5h6h7/5 ^3^ :q 7V/4 |
    notes :8 t12p7/4 s5s3/4 :8 3s:16:5-7/5 :q p5/4
voice
    notes :h 5/6 :q 5/6 :8 4-5/5 | :w 5/5`;
      return assert.notEqual(null, tab.parse(code));
    }

    /**
     * Validate fingering annotations and string numbers.
     */
    static fingering(assert) {
      var tab;
      assert.expect(7);
      tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:r:s:1.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:l:f:1.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:a:s:1.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:b:s:1.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:l:f:1.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:r:s:1.$"));
      return assert.ok(true, "all pass");
    }

    /**
     * Basic render test to ensure no exceptions in drawing pipeline.
     */
    static render(assert) {
      var renderer, tab;
      tab = makeParser();
      renderer = makeRenderer("Render");
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:r:s:1.$"));
      tab.getArtist().render(renderer);
      return assert.ok(true, "all pass");
    }

    /**
     * Render a complex score to exercise layout and formatter behavior.
     */
    static renderComplex(assert) {
      var code;
      code = `options space=20 tab-stems=true stave-distance=40 tab-stem-direction=down
tabstave notation=true key=A time=4/4
    notes :q =|: (5/2.5/3.7/4) :8 7-5h6/3 ^3^ 5h6-7/5 ^3^ :q 7V/4 |
    notes :8 t12p7/4 s5s3/4 :8 3s:16:5-7/5 :h p5/4
    text :w, |#segno, ,|, :hd, , #tr

options space=65
tabstave notation=true
    notes :q (5/4.5/5) (7/4.7/5)s(5/4.5/5) ^3^
    notes :8 7-5/4 $.a./b.$ (5/4.5/5)h(7/5) =:|
    notes :8 (12/5.12/4)ds(5/5.5/4)u 3b4/5
    notes :h (5V/6.5/4.6/3.7/2) $.italic.let ring$ =|=
    text :h, ,.font=Times-12-italic, D.S. al coda, |#coda
    text :h, ,.-1, .font=Arial-14-bold,A13
    text ++, .30, #f

options space=70`;
      return renderTest(assert, "Render Complex", code);
    }

    /**
     * Validate tab stem rendering behavior.
     */
    static tabStems(assert) {
      var code;
      code = `options tab-stems=true
tabstave key=A
notes :q (5/2.5/3.7/4) $.a./b.$ :8 5h6/3 7/4 $.a>/b.$
notes :16 5h6/3 7/4 $.a>/b.$
notes :8d 5/5`;
      renderTest(assert, "Tab Stems", code);
      code = `options tab-stems=true tab-stem-direction=down
tabstave key=A notation=true
notes :q (5/2.5/3.7/4) $.a./b.$ :8 5h6/3 7/4 $.a>/b.$
notes :16 5h6/3 7/4 $.a>/b.$
notes :8d 5/5`;
      return renderTest(assert, "Tab Stem Direction", code);
    }

    /**
     * Validate rest rendering in tab staves.
     */
    static restsInTab(assert) {
      var code;
      code = `options tab-stems=true
tabstave key=A
notes :q (5/2.5/3.7/4) $.a./b.$ :8 5h6/3 7/4 $.a>/b.$
notes :16 5h6/3 7/4 $.a>/b.$
notes :8d ##`;
      return renderTest(assert, "Rests in Tab", code);
    }

    /**
     * Validate time-signature-based beaming.
     */
    static timeSigBeaming(assert) {
      var code;
      code = `tabstave notation=true tablature=false time=4/4
notes :8 ## D-E-F-G-A-B/4 C/5

tabstave notation=true tablature=false time=6/8
notes :8 C-D-E-F/4 ## A-B/4 C-D-E-F-:16:G-F/5`;
      return renderTest(assert, "Time Signature based Beaming", code);
    }

    /**
     * Validate multi-string tab rendering.
     */
    static multiStringTab(assert) {
      var code;
      code = `tabstave key=A strings=4
notes :q (5/2.5/3.7/4) $.a./b.$ :8 5h6/3 7/4 $.a>/b.$
notes :16 5h6/3 7/4 $.a>/b.$
options space=20`;
      renderTest(assert, "Bass Tab", code);
      code = `tabstave key=A strings=8 tuning=E/5,B/4,G/4,D/4,A/3,E/3,B/2,G/2
notes :q (5/2.5/3.7/8) :8 5h6/3 7/8
notes :16 5h6/3 7/7`;
      return renderTest(assert, "8-string Tab", code);
    }

    /**
     * Validate override fret-note annotations for tab rendering.
     */
    static overrideFretNote(assert) {
      var code;
      code = `options stave-distance=30 space=20
options font-face=courier font-style=bold
tabstave notation=true key=A time=5/4
notes :q 8/4 $8/4$
notes B@4_8/4 $B@4_8/4$
notes B@~4_8/4 $B@~4_8/4$
notes C@@5_8/4 $C@@5_8/4$
notes G##5_5/1 $G##5_5/1$
text .font=Times-15-italic,|8va`;
      return renderTest(assert, "Override Fret Note", code);
    }

    /**
     * Validate mixed tuplets parsing and rendering.
     */
    static mixedTuplets(assert) {
      var code;
      code = `tabstave notation=true tablature=false key=G time=4/4
notes :q E/5 :8 E/5 ^3,2^ :8 E/5 :q E/5 ^3,2^
notes :8 E-E-E/5 ^3^ ## E-E/5 ^3^

options space=20`;
      return renderTest(assert, "Mixed Tuplets", code);
    }

    /**
     * Validate accidental strategy options and output.
     */
    static accidentalStrategies(assert) {
      var code;
      code = `options player=true tempo=80
tabstave notation=true key=G time=4/4
notes :8 5-5-6-6-5-5-3-3/3`;
      renderTest(assert, "Standard Accidental Strategy", code);
      code = `options player=true tempo=80 accidentals=cautionary
tabstave notation=true key=G time=4/4
notes :8 5-5-6-6-5-5-3-3/3`;
      return renderTest(assert, "Cautionary Accidental Strategy", code);
    }

    /**
     * Validate combined fret-hand fingering and string numbers.
     */
    static fingeringAndStrings(assert) {
      var code;
      code = `options space=40 player=true tempo=80 instrument=acoustic_guitar_nylon
tabstave notation=true tablature=false key=G time=4/4
voice
    notes !octave-shift -1!
    notes :8 ## (D/4.G/4.D/5.G/5)
    notes $.fingering/4:r:f:4-3:r:f:3.$
    notes $.fingering/4:l:s:1-3:r:s:2.$

    notes :h (E/4.G/4.C/5.E/5)
    notes $.fingering/1:r:f:2-3:r:f:1.$
    notes $.fingering/1:l:s:4-3:r:s:2.$
    notes :q ##
voice
    notes :8 G/3 $.fingering/1:r:f:2-1:r:s:6.$
    notes :8 F/3 $.fingering/1:r:f:1-1:r:s:6.$
    notes :q G/3 $.fingering/1:r:f:2-1:r:s:6.$
    notes :q G/3 $.fingering/1:r:f:2-1:r:s:6.$
    notes :q G/3 $.fingering/1:r:f:2-1:r:s:6.$

text .font=Arial-14-Bold,.-2
text :8,G,G/F,:h,Am/G

options space=60`;
      return renderTest(assert, "Fret Hand Fingering and String Numbers", code);
    }

  };

  /**
   * Assert that parsing `code` throws an error.
   */
  catchError = function(assert, tab, code, _error_type = "ParseError") {
    var caught; // Whether an error was thrown.
    caught = false;
    try {
      tab.parse(code);
    } catch (_e) {
      caught = true;
    }
    // equal(error.code, error_type, error.message)
    return assert.equal(true, caught);
  };

  /**
   * Create a fresh parser with a standard Artist configuration.
   */
  makeParser = function() {
    return new VexTab(new Artist(0, 0, 800, {
      scale: 0.8
    }));
  };

  /**
   * Create a renderer and attach a labeled container for a test.
   */
  makeRenderer = function(test_name) {
    var canvas, renderer, test_div; // DOM nodes + VexFlow renderer.
    test_div = $('<div></div>').addClass("testcanvas"); // Root test container.
    test_div.append($('<div></div>').addClass("name").text(test_name)); // Title label.
    canvas = $('<div></div>').addClass("vex-tabdiv"); // Render surface container.
    test_div.append(canvas);
    $("body").append(test_div);
    renderer = new Vex.Flow.Renderer(canvas[0], Vex.Flow.Renderer.Backends.SVG); // SVG renderer.
    renderer.getContext().setBackgroundFillStyle("#eed"); // Consistent background.
    return renderer;
  };

  /**
   * Render a test snippet and assert that parsing succeeds.
   */
  renderTest = function(assert, title, code) {
    var renderer, tab; // Parser + renderer for this test.
    tab = makeParser();
    renderer = makeRenderer(title);
    assert.notEqual(null, tab.parse(code));
    tab.getArtist().render(renderer);
    return assert.ok(true, "all pass");
  };

  // ID counter for getRenderedContent.
  idcounter = 0; // Monotonic counter to ensure unique canvas IDs.

  // Render content to a new div, and return the content.
  // Remove some things that change but aren't relevant (IDs)
  getRenderedContent = function(container, code, cssflex) {
    var canvasid, content, makeCanvas, renderCodeInCanvas; // Rendering helpers + output.
    idcounter += 1;
    canvasid = 'rendered-' + idcounter; // Unique ID for this render.
    makeCanvas = function() {
      var c, canvas, p; // Container, canvas node, and code label.
      c = $('<div></div>').css('flex', cssflex).css('font-size', '0.8em'); // Flexed column.
      p = $('<p></p>').css('margin-top', '0px'); // Label wrapper.
      p.append($('<pre></pre>').text(code).css('font-family', 'courier')); // Code preview.
      c.append(p);
      canvas = $('<div></div>').addClass("vex-tabdiv").attr('id', canvasid); // Render surface.
      c.append(canvas);
      return c;
    };
    renderCodeInCanvas = function() {
      var canvas, renderer, tab; // Local render context.
      tab = new VexTab(new Artist(0, 0, 500, {
        scale: 0.8
      }));
      tab.parse(code);
      canvas = $('#' + canvasid);
      renderer = new Vex.Flow.Renderer(canvas[0], Vex.Flow.Renderer.Backends.SVG);
      renderer.getContext().setBackgroundFillStyle("#eed");
      return tab.getArtist().render(renderer);
    };
    container.append(makeCanvas());
    renderCodeInCanvas();
    content = $('#' + canvasid).html().replace(/id=".*?"/g, 'id="xxx"'); // Normalize IDs.
    return content;
  };

  /**
   * Ensure that the rendered content of vex1 and vex2 are equivalent.
   */
  assertEquivalent = function(assert, title, vex1, vex2) {
    var container, newhtml, oldhtml, test_div; // DOM nodes + snapshots.
    test_div = $('<div></div>').addClass("testcanvas"); // Root test container.
    test_div.append($('<div></div>').addClass("name").text(title)); // Test label.
    container = $('<div></div>').css('display', 'flex'); // Side-by-side layout.
    test_div.append(container);
    $("body").append(test_div);
    oldhtml = getRenderedContent(container, vex1, '0 0 30%'); // Render baseline.
    newhtml = getRenderedContent(container, vex2, '1'); // Render comparison.
    return assert.equal(oldhtml, newhtml, title);
  };

  return VexTabTests;

}).call(this);

VexTabTests.Start(); // Register and run the VexTab test suite.
