import Vex from '../vexflow';
import parser from '../vextab.jison';
import type Artist from '../artist/Artist';
import { VexTabParser } from './VexTabParser';

/**
 * VexTab is the public API wrapper that invokes the Jison parser and then
 * dispatches the parsed AST into Artist instructions.
 */
export default class VexTab {
  static DEBUG = false;

  private artist: Artist;
  private valid = false;
  private elements: any = false;
  private compiler: VexTabParser;

  constructor(artist: Artist) {
    this.artist = artist;
    this.compiler = new VexTabParser(this.artist);
  }

  private log(...args: any[]): void {
    if (VexTab.DEBUG && console) {
      console.log('(Vex.Flow.VexTab)', ...args);
    }
  }

  reset(): void {
    this.valid = false;
    this.elements = false;
  }

  isValid(): boolean {
    return this.valid;
  }

  getArtist(): Artist {
    return this.artist;
  }

  parse(code?: string): any {
    const parserInstance = parser as any;
    parserInstance.parseError = (message: string, hash: any) => {
      this.log('VexTab parse error: ', message, hash);
      const formatted = `Unexpected text '${hash.text}' at line ${hash.loc.first_line} column ${hash.loc.first_column}.`;
      throw new Vex.RERR('ParseError', formatted);
    };

    if (!code) {
      throw new Vex.RERR('ParseError', 'No code');
    }

    this.log(`Parsing:\n${code}`);

    const stripped_code = code
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .join('\n');

    this.elements = parserInstance.parse(stripped_code);
    if (this.elements) {
      this.compiler.generate(this.elements);
      this.valid = true;
    }

    return this.elements;
  }
}
