// Public stateful parser for checked scores and the original fixed-layout Artist pipeline.
import type Artist from '../artist/Artist';
import { parseScore, type ScoreV2 } from '../score/parse';
import { readSyntax, ScoreError } from '../score/source';
import Vex from '../vexflow';
import { VexTabParser } from './VexTabParser';

/** The original Jison grammar returns an array of syntax elements, or null for comments alone. */
type ParseResult<Language> = Language extends 1 ? any[] | null : ScoreV2;

/** The Artist can come from a separately loaded bundle with its own constructor. */
function isArtist(value: unknown): value is Artist {
  return typeof (value as Artist)?.addStave === 'function';
}

/** Parse a fresh ScoreV2 per revision, or explicitly dispatch v1 instructions to an Artist. */
export default class VexTab<Language extends 1 | 2 = 2> {
  static DEBUG = false;
  private valid = false;
  private readonly artist?: Artist;
  private readonly compiler?: VexTabParser;

  /** Modern callers can pass the returned document to renderScore, renderScorePart or Player. */
  constructor(...mode: Language extends 2 ? [options?: { language?: 2 }] : never);
  /** Fixed engraving uses the original Artist instance and preserves its v1 syntax elements. */
  constructor(artist: Artist, options: { language: Language } & { language: 1 });
  constructor(target?: Artist | { language?: number }, options?: { language: number }) {
    if (isArtist(target)) {
      if (options?.language !== 1) {
        throw new TypeError('Use new VexTab(artist, { language: 1 }) for fixed engraving, or new VexTab() and renderScore() for language 2.');
      }
      this.artist = target;
      this.compiler = new VexTabParser(target);
    } else if (options || target?.language === 1) {
      throw new TypeError('Language 1 fixed engraving requires new VexTab(artist, { language: 1 }).');
    } else if (target?.language !== undefined && target.language !== 2) {
      throw new RangeError('Expected VexTab language 1 or 2');
    }
  }

  /** Clear validity between revisions. A bound Artist keeps its own construction state. */
  reset(): void {
    this.valid = false;
  }

  /** True only after a successful parse since the most recent reset or failed revision. */
  isValid(): boolean {
    return this.valid;
  }

  /** Return the exact Artist supplied for v1. ScoreV2 parsing constructs no renderer. */
  getArtist(): Language extends 1 ? Artist : undefined {
    return this.artist as Language extends 1 ? Artist : undefined;
  }

  /** Return a checked document by default. Errors retain offsets into the original source. */
  parse(source = ''): ParseResult<Language> {
    this.reset();
    if (VexTab.DEBUG) console.log('(Vex.Flow.VexTab) Parsing:\n' + source);
    const score = this.compiler ? this.parseFixed(source) : parseScore(source, { language: 2 });
    this.valid = Boolean(score);
    return score as ParseResult<Language>;
  }

  /** Keep the public ParseError and AST shape used by v1 fixed-layout clients. */
  private parseFixed(source: string): any[] | null {
    let elements;
    try {
      elements = readSyntax(source);
    } catch (error) {
      if (error instanceof ScoreError) throw Object.assign(new Vex.RERR('ParseError', error.message), { range: error.range });
      throw error;
    }
    if (elements) this.compiler.generate(elements);
    return elements;
  }
}
