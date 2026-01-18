// src/vextab/VexTabParser.ts
// Semantic compiler that turns the parsed VexTab AST into concrete Artist calls.

import Vex from '../vexflow'; // VexFlow shim for errors and helpers.
import * as _ from '../utils'; // Utility helpers (map, pick, etc.).
import type Artist from '../artist/Artist'; // Artist type for renderer calls.

/**
 * VexTabParser translates the parsed Jison AST into concrete Artist calls.
 * It isolates the "semantic" phase of VexTab from the raw parse step.
 */
export class VexTabParser {
  private artist: Artist; // Artist instance that receives rendering commands.

  /**
   * Create a compiler bound to an Artist.
   */
  constructor(artist: Artist) {
    this.artist = artist;
  }

  /**
   * Create a standardized parse error that includes line/column information.
   */
  private newError(object: any, msg: string): Error {
    return new Vex.RERR('ParseError', `${msg} in line ${object._l} column ${object._c}`);
  }

  /**
   * Parse and validate stave options into a simple key/value map.
   * Design note: validation happens here so the Artist stays focused on rendering.
   */
  parseStaveOptions(options?: any[]): Record<string, string> {
    const params: Record<string, string> = {}; // Parsed option map.
    if (!options) return params;

    let notation_option: any = null; // Track for combined notation/tablature validation.
    options.forEach((option) => {
      const error = (msg: string) => this.newError(option, msg); // Localized error helper.
      params[option.key] = option.value; // Store raw option value.
      switch (option.key) {
        case 'notation':
        case 'tablature':
          notation_option = option;
          if (!['true', 'false'].includes(option.value)) {
            throw error(`'${option.key}' must be 'true' or 'false'`);
          }
          break;
        case 'key': {
          const has_key = Vex.Flow?.hasKeySignature
            ? Vex.Flow.hasKeySignature(option.value)
            : _.has(Vex.Flow?.keySignature?.keySpecs, option.value);
          if (!has_key) {
            throw error(`Invalid key signature '${option.value}'`);
          }
          break;
        }
        case 'clef': {
          const clefs = ['treble', 'bass', 'tenor', 'alto', 'percussion', 'none'];
          if (!clefs.includes(option.value)) {
            throw error(`'clef' must be one of ${clefs.join(', ')}`);
          }
          break;
        }
        case 'voice': {
          const voices = ['top', 'bottom', 'new'];
          if (!voices.includes(option.value)) {
            throw error(`'voice' must be one of ${voices.join(', ')}`);
          }
          break;
        }
        case 'time':
          try {
            // Use VexFlow's TimeSignature validation for consistency.
            new Vex.Flow.TimeSignature(option.value);
          } catch (_e) {
            throw error(`Invalid time signature: '${option.value}'`);
          }
          break;
        case 'tuning':
          try {
            // Use VexFlow's Tuning validation for consistency.
            new Vex.Flow.Tuning(option.value);
          } catch (_e) {
            throw error(`Invalid tuning: '${option.value}'`);
          }
          break;
        case 'strings': {
          const num_strings = parseInt(option.value, 10);
          if (num_strings < 4 || num_strings > 8) {
            throw error(`Invalid number of strings: ${num_strings}`);
          }
          break;
        }
        default:
          throw error(`Invalid option '${option.key}'`);
      }
    });

    if (params.notation === 'false' && params.tablature === 'false') {
      throw this.newError(notation_option, "Both 'notation' and 'tablature' can't be invisible");
    }

    return params;
  }

  /**
   * Dispatch a parsed command element to the Artist.
   */
  parseCommand(element: any): void {
    if (element.command === 'bar') {
      this.artist.addBar(element.type);
    }

    if (element.command === 'tuplet') {
      this.artist.makeTuplets(element.params.tuplet, element.params.notes);
    }

    if (element.command === 'annotations') {
      this.artist.addAnnotations(element.params);
    }

    if (element.command === 'rest') {
      this.artist.addRest(element.params);
    }

    if (element.command === 'command') {
      this.artist.runCommand(element.params, element._l, element._c);
    }
  }

  /**
   * Convert a chord AST node into an Artist chord call.
   */
  parseChord(element: any): void {
    this.artist.log('parseChord:', element);
    this.artist.addChord(
      _.map(
        element.chord,
        (note) => _.pick(note, 'time', 'dot', 'fret', 'abc', 'octave', 'string', 'articulation', 'decorator'),
      ),
      element.articulation,
      element.decorator,
    );
  }

  /**
   * Convert a fret-based note AST node into an Artist note call.
   */
  parseFret(note: any): void {
    this.artist.addNote(_.pick(note, 'time', 'dot', 'fret', 'string', 'articulation', 'decorator'));
  }

  /**
   * Convert an ABC note AST node into an Artist note call.
   */
  parseABC(note: any): void {
    this.artist.addNote(_.pick(note, 'time', 'dot', 'fret', 'abc', 'octave', 'string', 'articulation', 'decorator'));
  }

  /**
   * Parse a list of stave elements (notes, chords, commands) into Artist calls.
   */
  parseStaveElements(notes: any[]): void {
    this.artist.log('parseStaveElements:', notes);
    notes.forEach((element) => {
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
        this.parseABC(element);
      } else if (element.fret) {
        this.parseFret(element);
      }
    });
  }

  /**
   * Parse stave text tokens into text voices and text notes.
   * Design note: this parser is permissive to preserve legacy VexTab behavior.
   */
  parseStaveText(text_line: any[]): void {
    if (!_.isEmpty(text_line)) {
      this.artist.addTextVoice();
    }

    let position = 0; // X position within the text stave.
    let justification: 'center' | 'left' | 'right' = 'center'; // Text alignment.
    let smooth = true; // Whether to smooth text note spacing.
    let font: string | null = null; // Optional font override.

    const bartext = () => this.artist.addTextNote('', 0, justification, false, true); // Render bar separator.

    const createNote = (text: string, token: any) => {
      let ignore_ticks = false; // Whether to ignore ticks for this note.
      let display = text; // Display text to render.
      if (display[0] === '|') {
        ignore_ticks = true;
        display = display.slice(1);
      }

      try {
        this.artist.addTextNote(display, position, justification, smooth, ignore_ticks);
      } catch (e) {
        throw this.newError(token, `Bad text or duration. Did you forget a comma?${e}`);
      }
    };

    text_line.forEach((token) => {
      let text = token.text.trim(); // Token text with surrounding whitespace removed.
      if (text.match(/\.font=.*/)) {
        font = text.slice(6); // Extract font name after ".font=" prefix.
        this.artist.setTextFont(font); // Apply font override.
      } else if (text[0] === ':') {
        this.artist.setDuration(text); // Update duration marker.
      } else if (text[0] === '.') {
        const command = text.slice(1); // Text commands prefixed with a dot.
        switch (command) {
          case 'center':
          case 'left':
          case 'right':
            justification = command;
            break;
          case 'strict':
            smooth = false;
            break;
          case 'smooth':
            smooth = true;
            break;
          case 'bar':
          case '|':
            bartext();
            break;
          default:
            position = parseInt(text.slice(1), 10);
            break;
        }
      } else if (text === '|') {
        bartext();
      } else if (text.slice(0, 2) === '++') {
        this.artist.addTextVoice();
      } else {
        createNote(text, token);
      }
    });
  }

  /**
   * Entry point to translate the parsed AST into Artist calls.
   * Design note: we handle each "stave" element sequentially to preserve order.
   */
  generate(elements: any[]): void {
    elements.forEach((stave) => {
      switch (stave.element) {
        case 'stave':
        case 'tabstave':
          this.artist.addStave(stave.element, this.parseStaveOptions(stave.options)); // Create the stave.
          if (stave.notes) this.parseStaveElements(stave.notes); // Parse notes for the stave.
          if (stave.text) this.parseStaveText(stave.text); // Parse any text line.
          break;
        case 'voice':
          this.artist.addVoice(this.parseStaveOptions(stave.options)); // Add a voice to current stave.
          if (stave.notes) this.parseStaveElements(stave.notes); // Parse notes for the voice.
          if (stave.text) this.parseStaveText(stave.text); // Parse any text line.
          break;
        case 'options': {
          const options: Record<string, string> = {}; // Aggregate options into a map.
          stave.params.forEach((option: any) => {
            options[option.key] = option.value;
          });
          try {
            this.artist.setOptions(options);
          } catch (e: any) {
            throw this.newError(stave, e.message);
          }
          break;
        }
        default:
          throw this.newError(stave, `Invalid keyword '${stave.element}'`);
      }
    });
  }
}
