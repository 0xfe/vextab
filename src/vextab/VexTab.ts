// src/vextab/VexTab.ts
// Public-facing VexTab wrapper that wires the parser to the Artist renderer.

import Vex from '../vexflow'; // VexFlow shim for legacy errors/logging.
import parser from '../vextab.jison'; // Jison-generated parser module.
import type Artist from '../artist/Artist'; // Artist type for rendering callbacks.
import { VexTabParser } from './VexTabParser'; // Compiler from AST to Artist calls.

/**
 * VexTab is the public API wrapper that invokes the Jison parser and then
 * dispatches the parsed AST into Artist instructions.
 */
export default class VexTab {
  static DEBUG = false; // Enable debug logging in the parser pipeline.

  private artist: Artist; // Artist instance that will receive rendering instructions.
  private valid = false; // Whether the last parse was successful.
  private elements: any = false; // AST elements returned from the parser.
  private compiler: VexTabParser; // Compiler that turns AST into Artist calls.

  /**
   * Create a VexTab parser wrapper around an Artist.
   */
  constructor(artist: Artist) {
    this.artist = artist;
    this.compiler = new VexTabParser(this.artist); // Keep compiler bound to the artist.
  }

  /**
   * Internal conditional logger.
   */
  private log(...args: any[]): void {
    if (VexTab.DEBUG && console) {
      console.log('(Vex.Flow.VexTab)', ...args);
    }
  }

  /**
   * Reset the parser validity state for a new parse.
   */
  reset(): void {
    this.valid = false;
    this.elements = false;
  }

  /**
   * Return whether the last parse was valid.
   */
  isValid(): boolean {
    return this.valid;
  }

  /**
   * Return the bound Artist instance.
   */
  getArtist(): Artist {
    return this.artist;
  }

  /**
   * Parse VexTab source, compile the AST, and return the parsed elements.
   * Design note: we trim each line to keep whitespace predictable and consistent.
   */
  parse(code?: string): any {
    const parserInstance = parser as any; // Jison parser instance.
    parserInstance.parseError = (message: string, hash: any) => {
      this.log('VexTab parse error: ', message, hash);
      const formatted = `Unexpected text '${hash.text}' at line ${hash.loc.first_line} column ${hash.loc.first_column}.`; // Human-friendly error.
      throw new Vex.RERR('ParseError', formatted);
    };

    if (!code) {
      throw new Vex.RERR('ParseError', 'No code');
    }

    this.log(`Parsing:\n${code}`);

    const stripped_code = code // Normalize whitespace for the grammar.
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .join('\n');

    this.elements = parserInstance.parse(stripped_code); // Parse into AST elements.
    if (this.elements) {
      this.compiler.generate(this.elements); // Compile into Artist calls.
      this.valid = true; // Mark last parse as valid.
    }

    return this.elements;
  }
}
