/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// Vex.Flow.VexTab
// Copyright 2012 Mohit Cheppudira <mohit@muthanna.com>
//
// This class implements the semantic analysis of the Jison
// output, and generates elements that can be used by
// Vex.Flow.Artist to render the notation.
// parsed by Vex.Flow.VexTab.

import Vex from 'vexflow';
import * as _ from 'lodash';
import { parser } from './vextab.jison';

var VexTab = (function() {
  let L = undefined;
  let newError = undefined;
  VexTab = class VexTab {
    static initClass() {
      this.DEBUG = false;
      L = function(...args) { if (VexTab.DEBUG) { return (typeof console !== 'undefined' && console !== null ? console.log("(Vex.Flow.VexTab)", ...Array.from(args)) : undefined); } };
  
      // Private methods
      newError = (object, msg) => new Vex.RuntimeError("ParseError",
                   `${msg} in line ${object._l} column ${object._c}`);
    }

    // Public methods
    constructor(artist) {
      this.artist = artist;
      this.reset();
    }

    reset() {
      this.valid = false;
      return this.elements = false;
    }

    isValid() { return this.valid; }

    getArtist() { return this.artist; }

    parseStaveOptions(options) {
      const params = {};
      if (options == null) { return params; }

      let notation_option = null;
      for (var option of Array.from(options)) {
        var e;
        var error = msg => newError(option, msg);
        params[option.key] = option.value;
        switch (option.key) {
          case "notation": case "tablature":
            notation_option = option;
            if (!["true", "false"].includes(option.value)) { throw error(`'${option.key}' must be 'true' or 'false'`); }
            break;
          case "key":
            if (!Vex.Flow.hasKeySignature(option.value)) { throw error(`Invalid key signature '${option.value}'`); }
            break;
          case "clef":
            var clefs = ["treble", "bass", "tenor", "alto", "percussion", "none"];
            if (!Array.from(clefs).includes(option.value)) { throw error(`'clef' must be one of ${clefs.join(', ')}`); }
            break;
          case "voice":
            var voices = ["top", "bottom", "new"];
            if (!Array.from(voices).includes(option.value)) { throw error(`'voice' must be one of ${voices.join(', ')}`); }
            break;
          case "time":
            try {
              new Vex.Flow.TimeSignature(option.value);
            } catch (error1) {
              e = error1;
              throw error(`Invalid time signature: '${option.value}'`);
            }
            break;
          case "tuning":
            try {
              new Vex.Flow.Tuning(option.value);
            } catch (error2) {
              e = error2;
              throw error(`Invalid tuning: '${option.value}'`);
            }
            break;
          case "strings":
            var num_strings = parseInt(option.value);
            if ((num_strings < 4) || (num_strings > 8)) { throw error(`Invalid number of strings: ${num_strings}`); }
            break;
          default:
            throw error(`Invalid option '${option.key}'`);
        }
      }

      if ((params.notation === "false") && (params.tablature === "false")) {
        throw newError(notation_option, "Both 'notation' and 'tablature' can't be invisible");
      }

      return params;
    }

    parseCommand(element) {
      if (element.command === "bar") {
        this.artist.addBar(element.type);
      }

      if (element.command === "tuplet") {
        this.artist.makeTuplets(element.params.tuplet, element.params.notes);
      }

      if (element.command === "annotations") {
        this.artist.addAnnotations(element.params);
      }

      if (element.command === "rest") {
        this.artist.addRest(element.params);
      }

      if (element.command === "command") {
        return this.artist.runCommand(element.params, element._l, element._c);
      }
    }

    parseChord(element) {
      L("parseChord:", element);
      return this.artist.addChord(
        _.map(element.chord,
              note => _.pick(note, 'time', 'dot', 'fret', 'abc', 'octave', 'string', 'articulation', 'decorator')),
        element.articulation, element.decorator);
    }

    parseFret(note) {
      return this.artist.addNote(_.pick(
        note, 'time', 'dot', 'fret', 'string', 'articulation', 'decorator'));
    }

    parseABC(note) {
      return this.artist.addNote(_.pick(
        note, 'time', 'dot', 'fret', 'abc', 'octave', 'string', 'articulation', 'decorator'));
    }

    parseStaveElements(notes) {
      L("parseStaveElements:", notes);
      return (() => {
        const result = [];
        for (var element of Array.from(notes)) {
          if (element.time) {
            this.artist.setDuration(element.time, element.dot);
          }

          if (element.command) {
            this.parseCommand(element);
          }

          if (element.chord) {
            this.parseChord(element);
          }

          if (element.abc) {
            result.push(this.parseABC(element));
          } else if (element.fret) {
            result.push(this.parseFret(element));
          } else {
            result.push(undefined);
          }
        }
        return result;
      })();
    }

    parseStaveText(text_line) {
      if (!_.isEmpty(text_line)) { this.artist.addTextVoice(); }

      let position = 0;
      let justification = "center";
      let smooth = true;
      let font = null;

      const bartext = () => this.artist.addTextNote("", 0, justification, false, true);
      const createNote = text => {
        let ignore_ticks = false;
        if (text[0] === "|") {
          ignore_ticks = true;
          text = text.slice(1);
        }

        try {
          return this.artist.addTextNote(text, position, justification, smooth, ignore_ticks);
        } catch (e) {
          throw newError(str, "Bad text or duration. Did you forget a comma?" + e);
        }
      };

      return (() => {
        const result = [];
        for (var str of Array.from(text_line)) {
          var text = str.text.trim();
          if (text.match(/\.font=.*/)) {
            font = text.slice(6);
            result.push(this.artist.setTextFont(font));
          } else if (text[0] === ":") {
            result.push(this.artist.setDuration(text));
          } else if (text[0] === ".") {
            var command = text.slice(1);
            switch (command) {
              case "center": case "left": case "right":
                result.push(justification = command);
                break;
              case "strict":
                result.push(smooth = false);
                break;
              case "smooth":
                result.push(smooth = true);
                break;
              case "bar": case "|":
                result.push(bartext());
                break;
              default:
                result.push(position = parseInt(text.slice(1), 10));
            }
          } else if (text === "|") {
            result.push(bartext());
          } else if (text.slice(0, 2) === "++") {
            result.push(this.artist.addTextVoice());
          } else {
            result.push(createNote(text));
          }
        }
        return result;
      })();
    }

    generate() {
      return (() => {
        const result = [];
        for (var stave of Array.from(this.elements)) {
          switch (stave.element) {
            case "stave": case "tabstave":
              this.artist.addStave(stave.element, this.parseStaveOptions(stave.options));
              if (stave.notes != null) { this.parseStaveElements(stave.notes); }
              if (stave.text != null) { result.push(this.parseStaveText(stave.text)); } else {
                result.push(undefined);
              }
              break;
            case "voice":
              this.artist.addVoice(this.parseStaveOptions(stave.options));
              if (stave.notes != null) { this.parseStaveElements(stave.notes); }
              if (stave.text != null) { result.push(this.parseStaveText(stave.text)); } else {
                result.push(undefined);
              }
              break;
            case "options":
              var options = {};
              for (var option of Array.from(stave.params)) {
                options[option.key] = option.value;
              }
              try {
                result.push(this.artist.setOptions(options));
              } catch (e) {
                throw newError(stave, e.message);
              }
              break;
            default:
              throw newError(stave, `Invalid keyword '${stave.element}'`);
          }
        }
        return result;
      })();
    }

    parse(code) {
      parser.parseError = function(message, hash) {
        L("VexTab parse error: ", message, hash);
        message = `Unexpected text '${hash.text}' at line ${hash.loc.first_line} column ${hash.loc.first_column}.`;
        throw new Vex.RuntimeError("ParseError", message);
      };

      if (code == null) { throw new Vex.RuntimeError("ParseError", "No code"); }

      L(`Parsing:\n${code}`);

      // Strip lines
      const stripped_code = (Array.from(code.split(/\r\n|\r|\n/)).map((line) => line.trim()));
      this.elements = parser.parse(stripped_code.join("\n"));
      if (this.elements) {
        this.generate();
        this.valid = true;
      }

      return this.elements;
    }
  };
  VexTab.initClass();
  return VexTab;
})();

export default VexTab;
