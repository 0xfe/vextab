// Public-facing VexTab wrapper that wires the parser to the Artist renderer.
import Vex from '../vexflow';
import { readSyntax, ScoreError } from '../score/source';
import type Artist from '../artist/Artist';
import { VexTabParser } from './VexTabParser';

/**
 * VexTab is the public API wrapper that invokes the Jison parser and then
 * dispatches the parsed AST into Artist instructions.
 */
export default class VexTab {
  // Enable debug logging in the parser pipeline.
  static DEBUG = false;

  // Artist instance that will receive rendering instructions.
  private artist: Artist;
  // Whether the last parse was successful.
  private valid = false;
  // AST elements returned from the parser.
  private elements: any = false;
  // Compiler that turns AST into Artist calls.
  private compiler: VexTabParser;

  /**
   * Create a VexTab parser wrapper around an Artist.
   */
  constructor(artist: Artist) {
    this.artist = artist;
    // Keep compiler bound to the artist for the lifetime of this parser.
    this.compiler = new VexTabParser(this.artist);
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
   * Preserve horizontal whitespace so diagnostics refer to the original source.
   */
  parse(code?: string): any {
    this.reset();
    this.log(`Parsing:\n${code}`);
    try {
      this.elements = readSyntax(code);
    } catch (error) {
      if (error instanceof ScoreError) throw Object.assign(new Vex.RERR('ParseError', error.message), { range: error.range });
      throw error;
    }
    if (this.elements) {
      // Translate the AST into Artist calls.
      this.compiler.generate(this.elements);
      this.valid = true;
    }

    return this.elements;
  }
}
