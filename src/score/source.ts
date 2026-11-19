// Shared Jison entry with optional original-source ranges for the score compiler.
import parser from '../vextab.jison';

/** Half-open UTF-16 offsets match textarea selectionStart / selectionEnd. */
export interface SourceRange {
  start: number;
  end: number;
  line: number;
  column: number;
}

/** A host can distinguish unsupported engraving from invalid music. */
export class ScoreError extends Error {
  constructor(readonly code: 'syntax' | 'measure' | 'fixed-layout', message: string, readonly range: SourceRange) {
    super(`${message} at line ${range.line} column ${range.column}.`);
  }
}

/** Jison scans normalized newlines. Translate both endpoints back to the original string. */
export function readSyntax(source: string, track = false) {
  let lines: number[];
  function range(loc: any): SourceRange {
    // The fixed Artist needs this index only when a parse fails.
    if (!lines) {
      lines = [0];
      const breaks = /\r\n|\r|\n/g;
      while (breaks.exec(source)) lines.push(breaks.lastIndex);
    }
    return { start: lines[loc.first_line - 1] + loc.first_column, end: lines[loc.last_line - 1] + loc.last_column,
      line: loc.first_line, column: loc.first_column };
  }
  if (!source?.trim()) throw new ScoreError('syntax', 'No code', { start: 0, end: 0, line: 1, column: 0 });
  // Both compilers receive one fretted head for the entire pre-bend gesture.
  function prebend(text: string, loc: any) {
    const [fret, peak, release] = text.split('z').map(Number);
    if (!Number.isSafeInteger(fret) || !Number.isSafeInteger(peak) || peak <= fret) {
      throw new ScoreError('syntax', 'A pre-bend must start above the fretted pitch', range(loc));
    }
    if (release !== undefined && release !== fret) {
      throw new ScoreError('syntax', 'Release the pre-bend to its original fret', range(loc));
    }
    return { fret: String(fret), prebend: { semitones: peak - fret, release: release !== undefined } };
  }
  const instance = Object.create(parser);
  instance.yy = { ...instance.yy, locate: track ? range : undefined, prebend };
  // Jison's error hash describes the last shifted token. The lexer has the rejected lookahead.
  instance.lexer = Object.create(instance.lexer);
  let lexer: any;
  const setInput = instance.lexer.setInput;
  instance.lexer.setInput = function (...args: any[]) {
    lexer = setInput.apply(this, args);
    return lexer;
  };
  instance.parseError = (_message: string, hash: any) => {
    throw new ScoreError('syntax', `Unexpected text '${hash.text}'`, range(lexer.yylloc));
  };
  return instance.parse(source.replace(/\r\n?/g, '\n'));
}
