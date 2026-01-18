import Vex from '../vexflow';
import * as _ from '../utils';
import type Artist from '../artist/Artist';

/**
 * VexTabParser translates the parsed Jison AST into concrete Artist calls.
 * It isolates the "semantic" phase of VexTab from the raw parse step.
 */
export class VexTabParser {
  private artist: Artist;

  constructor(artist: Artist) {
    this.artist = artist;
  }

  private newError(object: any, msg: string): Error {
    return new Vex.RERR('ParseError', `${msg} in line ${object._l} column ${object._c}`);
  }

  parseStaveOptions(options?: any[]): Record<string, string> {
    const params: Record<string, string> = {};
    if (!options) return params;

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
             
            new Vex.Flow.TimeSignature(option.value);
          } catch (_e) {
            throw error(`Invalid time signature: '${option.value}'`);
          }
          break;
        case 'tuning':
          try {
             
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

  parseChord(element: any): void {
    this.artist.log('parseChord:', element);
    this.artist.addChord(
      _.map(element.chord, (note) => _.pick(note, 'time', 'dot', 'fret', 'abc', 'octave', 'string', 'articulation', 'decorator')),
      element.articulation,
      element.decorator,
    );
  }

  parseFret(note: any): void {
    this.artist.addNote(_.pick(note, 'time', 'dot', 'fret', 'string', 'articulation', 'decorator'));
  }

  parseABC(note: any): void {
    this.artist.addNote(_.pick(note, 'time', 'dot', 'fret', 'abc', 'octave', 'string', 'articulation', 'decorator'));
  }

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

  parseStaveText(text_line: any[]): void {
    if (!_.isEmpty(text_line)) {
      this.artist.addTextVoice();
    }

    let position = 0;
    let justification: 'center' | 'left' | 'right' = 'center';
    let smooth = true;
    let font: string | null = null;

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
        font = text.slice(6);
        this.artist.setTextFont(font);
      } else if (text[0] === ':') {
        this.artist.setDuration(text);
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

  generate(elements: any[]): void {
    elements.forEach((stave) => {
      switch (stave.element) {
        case 'stave':
        case 'tabstave':
          this.artist.addStave(stave.element, this.parseStaveOptions(stave.options));
          if (stave.notes) this.parseStaveElements(stave.notes);
          if (stave.text) this.parseStaveText(stave.text);
          break;
        case 'voice':
          this.artist.addVoice(this.parseStaveOptions(stave.options));
          if (stave.notes) this.parseStaveElements(stave.notes);
          if (stave.text) this.parseStaveText(stave.text);
          break;
        case 'options': {
          const options: Record<string, string> = {};
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
