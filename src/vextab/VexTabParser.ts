// Semantic compiler that turns the parsed VexTab AST into concrete Artist calls.
import { isScoreColor } from '../score/color';
import Vex from '../vexflow';
import * as _ from '../utils';
import type Artist from '../artist/Artist';
import { staveMeter } from '../artist/StaveBuilder';

/**
 * VexTabParser translates the parsed Jison AST into concrete Artist calls.
 * It isolates the "semantic" phase of VexTab from the raw parse step.
 */
export class VexTabParser {
  // Artist instance that receives rendering commands.
  private artist: Artist;

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
  parseStaveOptions(options?: any[], element = 'voice'): Record<string, string> {
    const params: Record<string, string> = {};
    if (!options) return params;

    // Track notation/tablature to validate mutual visibility.
    let notation_option: any = null;
    options.forEach((option) => {
      const error = (msg: string) => this.newError(option, msg);
      params[option.key] = option.value;
      switch (option.key) {
        case 'notation':
        case 'tablature':
          notation_option = option;
          if (!['true', 'false'].includes(option.value)) {
            throw error(`'${option.key}' must be 'true' or 'false'`);
          }
          break;
        case 'color':
          if (element === 'voice' || !isScoreColor(option.value)) throw error('Expected a stave color as a CSS name or hex value');
          break;
        case 'pickup':
          if (!/^([1-9]\d*)\/([1-9]\d*)$/.test(option.value)) throw error('Expected a pickup span such as 1/4');
          break;
        case 'fragment':
          if (!['true', 'false'].includes(option.value)) throw error('fragment must be true or false');
          break;
        case 'show-time':
          if (!['true', 'false'].includes(option.value)) throw error('show-time must be true or false');
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
            staveMeter(option.value);
          } catch {
            throw error(`Invalid time signature: '${option.value}'`);
          }
          break;
        case 'tuning':
          try {
            new Vex.Flow.Tuning(option.value);
          } catch {
            throw error(`Invalid tuning: '${option.value}'`);
          }
          break;
        case 'strings': {
          const num_strings = Number(option.value);
          if (!Number.isInteger(num_strings) || num_strings < 4 || num_strings > 8) {
            throw error(`Invalid number of strings: ${num_strings}`);
          }
          break;
        }
        default:
          throw error(`Invalid option '${option.key}'`);
      }
    });

    const notation = params.notation ?? (element === 'tabstave' ? 'false' : 'true');
    const tab = params.tablature ?? (element === 'stave' ? 'false' : 'true');
    if (notation === 'false' && tab === 'false') {
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
    // Keep only relevant fields to avoid leaking parser internals.
    this.artist.addChord(
      _.map(
        element.chord,
        (note: Record<string, any>) => _.pick(note, 'time', 'dot', 'fret', 'prebend', 'openSlide', 'abc', 'octave', 'string', 'articulation', 'decorator'),
      ),
      element.articulation,
      element.decorator,
    );
  }

  /**
   * Convert a fret-based note AST node into an Artist note call.
   */
  parseFret(note: any): void {
    this.artist.addNote(_.pick(note, 'time', 'dot', 'fret', 'prebend', 'openSlide', 'string', 'articulation', 'decorator'));
  }

  /**
   * Convert an ABC note AST node into an Artist note call.
   */
  parseABC(note: any): void {
    this.artist.addNote(_.pick(note, 'time', 'dot', 'fret', 'prebend', 'openSlide', 'abc', 'octave', 'string', 'articulation', 'decorator'));
  }

  /**
   * Parse a list of stave elements (notes, chords, commands) into Artist calls.
   */
  parseStaveElements(notes: any[]): void {
    this.artist.log('parseStaveElements:', notes);
    const stave = _.last(this.artist.staves)!;
    const settings = _.last(stave.voiceSettings)!;
    let opening: { index: number; token: any } | undefined;
    notes.forEach((element) => {
      if (settings.options.beams === 'explicit') {
        if (element.command === 'open_beam') {
          if (opening) throw this.newError(element, 'Nested beam group');
          opening = { index: stave.tab_notes.length, token: element };
        }
        if (element.command === 'close_beam') {
          if (!opening) throw this.newError(element, 'Missing opening beam bracket');
          const members = stave.tab_notes.slice(opening.index);
          if (members.length < 2 || members.some(note => note.getIntrinsicTicks() >= Vex.Flow.RESOLUTION / 4)) {
            throw this.newError(element, 'Beams need at least two eighth notes or shorter values');
          }
          settings.groups.push([opening.index, stave.tab_notes.length]);
          opening = undefined;
        }
        if (opening && element.command === 'bar') throw this.newError(element, 'Beam crosses a barline');
      }
      if (element.time) {
        // Duration markers apply to subsequent notes.
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
    if (opening) throw this.newError(opening.token, 'Missing closing beam bracket');
  }

  /**
   * Parse stave text tokens into text voices and text notes.
   * Design note: this parser is permissive to preserve legacy VexTab behavior.
   */
  parseStaveText(text_line: any[]): void {
    if (!_.isEmpty(text_line)) {
      // Text lines start a new text voice.
      this.artist.addTextVoice();
    }

    // X position within the text stave.
    let position = 0;
    let justification: 'center' | 'left' | 'right' = 'center';
    let smooth = true;
    let font: string | null = null;

    // A bar token is represented as a zero-width spacer note.
    const bartext = () => this.artist.addTextNote('', 0, justification, false, true);

    const createNote = (text: string, token: any) => {
      let ignore_ticks = false;
      let display = text;
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
      let text = token.text.trim();
      if (text.match(/\.font=.*/)) {
        // Inline font overrides are applied immediately.
        font = text.slice(6);
        this.artist.setTextFont(font);
      } else if (text[0] === ':') {
        // Duration markers inside text lines affect spacing.
        this.artist.setDuration(text.slice(1));
      } else if (text[0] === '.') {
        const command = text.slice(1);
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
            if (!/^[+-]?\d+$/.test(command)) throw this.newError(token, `Invalid text position '${command}'`);
            position = Number(command);
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
          this.artist.addStave(stave.element, this.parseStaveOptions(stave.options, stave.element));
          if (stave.notes) this.parseStaveElements(stave.notes);
          if (stave.text) this.parseStaveText(stave.text);
          break;
        case 'voice':
          this.artist.addVoice(this.parseStaveOptions(stave.options, stave.element));
          if (stave.notes) this.parseStaveElements(stave.notes);
          if (stave.text) this.parseStaveText(stave.text);
          break;
        case 'options': {
          const options: Record<string, string> = {};
          stave.params.forEach((option: any) => {
            options[option.key] = option.value;
          });
          this.artist.setOptions(options, (key, message) =>
            this.newError(stave.params.find((param: any) => param.key === key), message));
          break;
        }
        default:
          throw this.newError(stave, `Invalid keyword '${stave.element}'`);
      }
    });
  }
}
