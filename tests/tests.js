/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
/*
VexTab Tests
Copyright Mohit Cheppudira 2010 <mohit@muthanna.com>
*/

import $ from 'jquery';
import Vex from 'vexflow';
import Artist from '../src/artist';
import VexTab from '../src/vextab';

const qunit = QUnit;
const {
  test
} = qunit;

Artist.DEBUG = false;
VexTab.DEBUG = false;

const MAJOR_KEYS = [
  'C',
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
  'Cb',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
];
const MINOR_KEYS = [
  'Am',
  'Dm',
  'Gm',
  'Cm',
  'Fm',
  'Bbm',
  'Ebm',
  'Abm',
  'Em',
  'Bm',
  'F#m',
  'C#m',
  'G#m',
  'D#m',
  'A#m',
];

const ALL_KEYS = [...MAJOR_KEYS, ...MINOR_KEYS];

var VexTabTests = (function() {
  let catchError = undefined;
  let makeParser = undefined;
  let makeRenderer = undefined;
  let renderTest = undefined;
  let idcounter = undefined;
  let getRenderedContent = undefined;
  let assertEquivalent = undefined;
  VexTabTests = class VexTabTests {
    static initClass() {
  
      // Private method
      catchError = function(assert, tab, code, error_type) {
        if (error_type == null) { error_type = "ParseError"; }
        let error = {
          code: "NoError",
          message: "Expected exception not caught"
        };
  
        let caught = false;
        try {
          tab.parse(code);
        } catch (e) {
          error = e;
          caught = true;
        }
  
        // equal(error.code, error_type, error.message)
        return assert.equal(true, caught);
      };
  
      makeParser = () => new VexTab(new Artist(0, 0, 800, {scale: 0.8}));
      makeRenderer = function(test_name){
        const test_div = $('<div></div>').addClass("testcanvas");
        test_div.append($('<div></div>').addClass("name").text(test_name));
        const canvas = $('<div></div>').addClass("vex-tabdiv");
        test_div.append(canvas);
        $("body").append(test_div);
  
        const renderer = new Vex.Flow.Renderer(canvas[0], Vex.Flow.Renderer.Backends.SVG);
        renderer.getContext().setBackgroundFillStyle("#eed");
        return renderer;
      };
  
      renderTest = function(assert, title, code) {
        const tab = makeParser();
        const renderer = makeRenderer(title);
        assert.notEqual(null, tab.parse(code));
        tab.getArtist().render(renderer);
        return assert.ok(true, "all pass");
      };
  
      // ID counter for getRenderedContent.
      idcounter = 0;
  
      // Render content to a new div, and return the content.
      // Remove some things that change but aren't relevant (IDs)
      getRenderedContent = function(container, code, cssflex) {
  
        idcounter += 1;
        const canvasid = 'rendered-' + idcounter;
  
        const makeCanvas = function() {
          const c = $('<div></div>').css('flex', cssflex).css('font-size', '0.8em');
          const p = $('<p></p>').css('margin-top', '0px');
          p.append($('<pre></pre>').text(code).css('font-family', 'courier'));
          c.append(p);
          const canvas = $('<div></div>').addClass("vex-tabdiv").attr('id', canvasid);
          c.append(canvas);
          return c;
        };
  
        const renderCodeInCanvas = function() {
          const tab = new VexTab(new Artist(0, 0, 500, {scale: 0.8}));
          tab.parse(code);
          const canvas = $('#' + canvasid);
          const renderer = new Vex.Flow.Renderer(canvas[0], Vex.Flow.Renderer.Backends.SVG);
          renderer.getContext().setBackgroundFillStyle("#eed");
          return tab.getArtist().render(renderer);
        };
  
        container.append(makeCanvas());
        renderCodeInCanvas();
        const content = $('#' + canvasid).
          html().
          replace(/id=\".*?\"/g, 'id="xxx"');
        return content;
      };
  
      // Ensure that the rendered content of vex1 and vex2 are equivalent.
      assertEquivalent = function(assert, title, vex1, vex2) {
        const test_div = $('<div></div>').addClass("testcanvas");
        test_div.append($('<div></div>').addClass("name").text(title));
        const container = $('<div></div>').css('display', 'flex');
        test_div.append(container);
        $("body").append(test_div);
        const oldhtml = getRenderedContent(container, vex1, '0 0 30%');
        const newhtml = getRenderedContent(container, vex2, '1');
        return assert.equal(oldhtml, newhtml, title);
      };
    }
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

    static basic(assert) {
      assert.expect(3);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n"));
      catchError(assert, tab, "tabstave\n notes /2 10/3");
      return assert.ok(true, "all pass");
    }

    static complex(assert) {
      assert.expect(2);
      const tab = makeParser();
      const code = `\
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
notes :8 [ t(12/5.12/4)s(5/5.5/4) 3b4/5 ] :h 5V/6\
`;

      assert.notEqual(null, tab.parse(code));
      return catchError(assert, tab, "tabstave\n notes :q 5/L");
    }

    static staveOptionsTest(assert) {
      assert.expect(3);
      const tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave notation=true key=C#"));
      catchError(assert, tab, "tabstave invalid=true");
      return catchError(assert, tab, "tabstave notation=boo");
    }

    static notationOnly(assert) {
      assert.expect(122);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave notation=true"));
      assert.notEqual(null, tab.parse("tabstave\n notes :w 1/2 | 1/3 | 1/5 | 1/4"));
      assert.notEqual(null, tab.parse("tabstave notation=true tablature=false"));
      assert.notEqual(null, tab.parse("tabstave\n notes :w 1/2 | 1/3 | 1/5 | 1/4"));

      catchError(assert, tab, "tabstave notation=false tablature=false");

      // CLEF TESTS
      const clefs = ["treble", "alto", "tenor", "bass"];

      for (var clef of Array.from(clefs)) {
        assert.notEqual(null, tab.parse("tabstave notation=true clef=" + clef));
        assert.notEqual(null, tab.parse("tabstave clef=" + clef));
      }

      catchError(assert, tab, "tabstave clef=blah");

      // KEY SIGNATURE TESTS

      for (const key of ALL_KEYS) {
        assert.notEqual(null, tab.parse("tabstave key=" + key));
        assert.notEqual(null, tab.parse("tabstave notation=true key=" + key));
        assert.notEqual(null, tab.parse("tabstave notation=true tablature=true key=" + key));
      }

      catchError(assert, tab, "tabstave notation=true key=rrr");

      // TIME SIGNATURE TESTS
      const times = ["C", "C|", "2/4", "4/4", "100/4"];

      for (var time of Array.from(times)) {
        assert.notEqual(null, tab.parse("tabstave time=" + time));
        assert.notEqual(null, tab.parse("tabstave notation=true time=" + time));
        assert.notEqual(null, tab.parse("tabstave notation=true tablature=true time=" + time));
      }

      catchError(assert, tab, "tabstave notation=true time=rrr");
      return assert.ok(true, "all pass");
    }

    static tuning(assert) {
      assert.expect(9);
      const tab = makeParser();

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

    static stringFret(assert) {
      assert.expect(5);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n notes 10/2 10/3"));
      catchError(assert, tab, "tabstave\n notes /2 10/3");
      catchError(assert, tab, "tabstave\n notes j/2 10/3");
      catchError(assert, tab, "tabstave\n notes 4");

      return assert.ok(true, "all pass");
    }

    static multiFret(assert) {
      assert.expect(4);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n notes 10-11/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10-11-12-13-15/3 5-4-3-2-1/2"));
      catchError(assert, tab, "tabstave\n notes 10/2-10");
      return catchError(assert, tab, "tabstave\n notes 10-/2");
    }

    static tie(assert) {
      assert.expect(6);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n notes 10s11/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10s11h12p10/3"));
      assert.notEqual(null, tab.parse("tabstave notation=true key=A\n notes :w 5/5 | T5/5 | T5V/5"));
      catchError(assert, tab, "tabstave\n notes 10/2s10");
      catchError(assert, tab, "tabstave\n notes 10s");

      return assert.ok(true, "all pass");
    }

    static bar(assert) {
      assert.expect(7);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n notes |10s11/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10s11h12p10/3|"));
      assert.notEqual(null, tab.parse("tabstave notation=true key=A\n notes || :w || 5/5 ||| T5/5 | T5V/5"));
      catchError(assert, tab, "tabstave\n | notes 10/2s10");

      let code = `tabstave notation=true key=E time=12/8
notes :w 7/4 | :w 6/5`;
      assertEquivalent(assert, "Sole notes line ends with bar", code, code + " |");

      code = `tabstave notation=true key=E time=12/8
notes :w 7/4 |
notes :w 6/5`;
      assertEquivalent(assert, "Last notes line ends with bar", code, code + " |");

      return assert.ok(true, "all pass");
    }


    static bend(assert) {
      assert.expect(5);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n notes 10b11/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10b11s12/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 10s11b12/3"));
      catchError(assert, tab, "tabstave\n notes 10b12b10b-/2");

      return assert.ok(true, "all pass");
    }

    static vibrato(assert) {
      assert.expect(10);
      const tab = makeParser();

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

    static strokes(assert) {
      assert.expect(10);
      const tab = makeParser();

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

    static chord(assert) {
      assert.expect(8);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n notes (4/6)"));
      assert.notEqual(null, tab.parse("tabstave\n notes (4/5.6/6)"));
      catchError(assert, tab, "tabstave\n notes (4/5.6/7)", "BadArguments");
      catchError(assert, tab, "tabstave\n notes (4");
      catchError(assert, tab, "tabstave\n notes (4/)");
      catchError(assert, tab, "tabstave\n notes (/5)");
      catchError(assert, tab, "tabstave\n notes (4/5.)");

      return assert.ok(true, "all pass");
    }

    static tapping(assert) {
      assert.expect(5);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n notes t5p4p3/3"));
      assert.notEqual(null, tab.parse("tabstave\n notes 5t12p5-4-3/1"));
      catchError(assert, tab, "tabstave\n notes 5t/4");
      catchError(assert, tab, "tabstave\n notes t-4-4h5/3");

      return assert.ok(true, "all pass");
    }

    static chordTies(assert) {
      assert.expect(7);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n notes (1/2.2/3)s(3/2.4/3)"));
      assert.notEqual(null, tab.parse("tabstave\n notes (1/2.2/3.3/4)s(3/2.4/3.5/4)"));
      assert.notEqual(null, tab.parse("tabstave\n notes (4/5.1/2.2/3)s(3/2.4/3)"));
      assert.notEqual(null, tab.parse("tabstave\n notes (1/2.2/3)s(3/2.5/5.4/3)"));
      assert.notEqual(null, tab.parse("tabstave\n notes (1/2.2/3)s(3/2.4/3)h(6/2.7/3)"));
      assert.notEqual(null, tab.parse("tabstave\n notes t(1/2.2/3)s(3/2.4/3)h(6/2.7/3)"));

      return assert.ok(true, "all pass");
    }

    static duration(assert) {
      const tab = makeParser();
      assert.notEqual(null, tab.parse("tabstave\n notes :w (1/2.2/3)s(3/2.4/3)"));
      assert.notEqual(null, tab.parse("tabstave\n notes :h (1/2.2/3)s(3/2.4/3) :q 1/2"));
      assert.notEqual(null, tab.parse("tabstave\n notes :h (1/2.2/3)s(3/2.4/3) 1/2 ^3^"));
      catchError(assert, tab, "tabstave notation=true\n notes :w (1/2.2/3)s(3/2.4/3) ^3^", "ArtistError");
      return assert.ok(true, "all pass");
    }

    static tripletsAndTuplets(assert) {
      assert.expect(1);
      const tab = makeParser();
      const code = `\
tabstave notation=true key=Ab tuning=eb
notes :8 5s7s8/5 ^3^ :16 (5/2.6/3) 7-12-15s21/3 ^5^
tabstave notation=true key=Ab tuning=eb
notes :8 5h7s9-12s15p12h15/5 ^7^ | :q 5-7-8/5 ^3^\
`;
      return assert.notEqual(null, tab.parse(code));
    }

    static dottedNotes(assert) {
      assert.expect(1);
      const tab = makeParser();
      const code = `\
tabstave notation=true time=4/4 key=Ab tuning=eb
notes :8d 5/4 :16 5/5 :8d 5/4 :16 5/5 :8d 5/4 :16 5/5 :q 5v/5\
`;
      return assert.notEqual(null, tab.parse(code));
    }

    static annotations(assert) {
      assert.expect(1);
      const tab = makeParser();
      const code = `\
tabstave notation=true time=4/4 key=Ab tuning=eb
notes :q 5/5 5/4 5/3 ^3^ $Fi,Ga,Ro!$ :h 4/4 $Blah!$

tabstave notation=true key=A
notes :q (5/2.5/3.7/4) $.big.A7#9$ 5h6/3 7/4 |
notes :8 7/4 $.italic.sweep$ 6/3 5/2 3v/1 :q 7v/5 $.Arial-10-bold.P.H$ :8 3s5/5\
`;
      return assert.notEqual(null, tab.parse(code));
    }

    static longBends(assert) {
      assert.expect(1);
      const tab = makeParser();
      const code = `\
tabstave notation=true key=A
notes :8 7b9b7b9b7s12b14b12s7s5s2/3\
`;
      return assert.notEqual(null, tab.parse(code));
    }

    static rest(assert) {
      assert.expect(1);
      const tab = makeParser();
      const code = `\
tabstave notation=true key=A
notes :8 ## 7b9b7b9b7s12b14b12s7s5s2/3 #0# 4/4 #9# 5/5\
`;
      return assert.notEqual(null, tab.parse(code));
    }

    static options(assert) {
      assert.expect(8);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("options width=400\ntabstave\n"));
      assert.notEqual(null, tab.parse("options font-face=Arial\ntabstave\n"));
      assert.notEqual(null, tab.parse("options font-size=10\ntabstave\n"));
      assert.notEqual(null, tab.parse("options font-style=italic\ntabstave\n"));
      assert.notEqual(null, tab.parse("options space=40\ntabstave\n"));
      assert.notEqual(null, tab.parse("options stave-distance=40\ntabstave\n"));
      catchError(assert, tab, "options w=40\ntabstave\n notes /2 10/3");
      return assert.ok(true, "all pass");
    }

    static abcNotes(assert) {
      assert.expect(6);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave notation=true\n notes A/5 C-D-E/5"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q A/5 C-D-:h:E/5"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (A/5.A/4)T(A/5.A/4)"));
      assert.notEqual(null, tab.parse("tabstave notation=true tablature=false\n notes A#/5 C##-D@@-E/5"));
      assert.notEqual(null, tab.parse("tabstave\n notes An/5 C-D@-E/5"));

      return assert.ok(true, "all pass");
    }

    static abcNotesWithFrets(assert) {
      assert.expect(6);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave notation=true\n notes A5_5/5 Cn~4_4-5-6/5"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q A/5 C-D-:h:A4_6/5"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (E@2_6/5.A/4)T(A/5.A/4)"));
      assert.notEqual(null, tab.parse("tabstave notation=true tablature=false\n notes A#3_4/5 C##-D@@-E/5"));
      assert.notEqual(null, tab.parse("tabstave\n notes A@~3_6/5 C-D@-E/5"));

      return assert.ok(true, "all pass");
    }

    static rhythmNotation(assert) {
      assert.expect(4);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n notes :qS A/5 C-D-:h:E/5"));
      assert.notEqual(null, tab.parse("tabstave notation=true\n notes :16S (A/5.A/4)T(A/5.A/4)"));
      assert.notEqual(null, tab.parse("tabstave notation=true tablature=false\n notes :qS X/5 C-D-:h:E/5"));

      return assert.ok(true, "all pass");
    }

    static textLines(assert) {
      assert.expect(6);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n notes :qS A/5 C-D-:h:E/5"));
      assert.notEqual(null, tab.parse("tabstave\n text .4, Blah, :16, Boo"));
      assert.notEqual(null, tab.parse("tabstave notation=true\n text .4, Blah, :16, Boo"));
      assert.notEqual(null, tab.parse("tabstave notation=true\n text .4, Blah,++, :16, Boo"));
      assert.notEqual(null, tab.parse("tabstave notation=true\n text .4, .strict, Blah,++, :16, .smooth, Boo"));

      return assert.ok(true, "all pass");
    }

    static sweepStrokes(assert) {
      assert.expect(8);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/rd.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/ru.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/bu.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/bd.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/qu.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.stroke/qd.$"));
      catchError(assert, tab, "tabstave\n notes :q (5/2.5/3.7/4) $.stroke/xd.$", "ArtistError");

      return assert.ok(true, "all pass");
    }

    static voices(assert) {
      assert.expect(1);
      const tab = makeParser();
      const code = `\
options stave-distance=30
tabstave notation=true
         key=A
         time=4/4
voice
    notes :q (5/2.5/3.7/4) :8 7p5h6/3 ^3^ 5h6h7/5 ^3^ :q 7V/4 |
    notes :8 t12p7/4 s5s3/4 :8 3s:16:5-7/5 :q p5/4
voice
    notes :h 5/6 :q 5/6 :8 4-5/5 | :w 5/5\
`;
      return assert.notEqual(null, tab.parse(code));
    }

    static fingering(assert) {
      assert.expect(7);
      const tab = makeParser();

      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:r:s:1.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:l:f:1.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:a:s:1.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:b:s:1.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:l:f:1.$"));
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:r:s:1.$"));

      return assert.ok(true, "all pass");
    }

    static render(assert) {
      const tab = makeParser();
      const renderer = makeRenderer("Render");
      assert.notEqual(null, tab.parse("tabstave\n notes :q (5/2.5/3.7/4) $.fingering/0:r:s:1.$"));
      tab.getArtist().render(renderer);
      return assert.ok(true, "all pass");
    }

    static renderComplex(assert) {
      const code = `\
options space=20 tab-stems=true stave-distance=40 tab-stem-direction=down
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

options space=70\
`;
      return renderTest(assert, "Render Complex", code);
    }


    static tabStems(assert) {
      let code = `\
options tab-stems=true
tabstave key=A
notes :q (5/2.5/3.7/4) $.a./b.$ :8 5h6/3 7/4 $.a>/b.$
notes :16 5h6/3 7/4 $.a>/b.$
notes :8d 5/5\
`;
      renderTest(assert, "Tab Stems", code);

      code = `\
options tab-stems=true tab-stem-direction=down
tabstave key=A notation=true
notes :q (5/2.5/3.7/4) $.a./b.$ :8 5h6/3 7/4 $.a>/b.$
notes :16 5h6/3 7/4 $.a>/b.$
notes :8d 5/5\
`;
      return renderTest(assert, "Tab Stem Direction", code);
    }

    static restsInTab(assert) {
      const code = `\
options tab-stems=true
tabstave key=A
notes :q (5/2.5/3.7/4) $.a./b.$ :8 5h6/3 7/4 $.a>/b.$
notes :16 5h6/3 7/4 $.a>/b.$
notes :8d ##\
`;
      return renderTest(assert, "Rests in Tab", code);
    }

    static timeSigBeaming(assert) {
      const code = `\
tabstave notation=true tablature=false time=4/4
notes :8 ## D-E-F-G-A-B/4 C/5

tabstave notation=true tablature=false time=6/8
notes :8 C-D-E-F/4 ## A-B/4 C-D-E-F-:16:G-F/5\
`;
      return renderTest(assert, "Time Signature based Beaming", code);
    }

    static multiStringTab(assert) {
      let code = `\
tabstave key=A strings=4
notes :q (5/2.5/3.7/4) $.a./b.$ :8 5h6/3 7/4 $.a>/b.$
notes :16 5h6/3 7/4 $.a>/b.$
options space=20\
`;
      renderTest(assert, "Bass Tab", code);

      code = `\
tabstave key=A strings=8 tuning=E/5,B/4,G/4,D/4,A/3,E/3,B/2,G/2
notes :q (5/2.5/3.7/8) :8 5h6/3 7/8
notes :16 5h6/3 7/7\
`;
      return renderTest(assert, "8-string Tab", code);
    }

    static overrideFretNote(assert) {
      const code = `\
options stave-distance=30 space=20
options font-face=courier font-style=bold
tabstave notation=true key=A time=5/4
notes :q 8/4 $8/4$
notes B@4_8/4 $B@4_8/4$
notes B@~4_8/4 $B@~4_8/4$
notes C@@5_8/4 $C@@5_8/4$
notes G##5_5/1 $G##5_5/1$
text .font=Times-15-italic,|8va\
`;
      return renderTest(assert, "Override Fret Note", code);
    }

    static mixedTuplets(assert) {
      const code = `\
tabstave notation=true tablature=false key=G time=4/4
notes :q E/5 :8 E/5 ^3,2^ :8 E/5 :q E/5 ^3,2^
notes :8 E-E-E/5 ^3^ ## E-E/5 ^3^

options space=20\
`;
      return renderTest(assert, "Mixed Tuplets", code);
    }

    static accidentalStrategies(assert) {
      let code = `\
options player=true tempo=80
tabstave notation=true key=G time=4/4
notes :8 5-5-6-6-5-5-3-3/3\
`;
      renderTest(assert, "Standard Accidental Strategy", code);

      code = `\
options player=true tempo=80 accidentals=cautionary
tabstave notation=true key=G time=4/4
notes :8 5-5-6-6-5-5-3-3/3\
`;
      return renderTest(assert, "Cautionary Accidental Strategy", code);
    }

    static fingeringAndStrings(assert) {
      const code = `\
options space=40 player=true tempo=80 instrument=acoustic_guitar_nylon
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

options space=60\
`;
      return renderTest(assert, "Fret Hand Fingering and String Numbers", code);
    }
  };
  VexTabTests.initClass();
  return VexTabTests;
})();

VexTabTests.Start();
