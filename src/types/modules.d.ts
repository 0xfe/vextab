// Module declarations for non-TS assets and external libraries used by the build.

declare module '*.jison' {
  // Jison parser modules export a parse method with optional parseError hook.
  const parser: {
    parse: (input: string) => any;
    parseError?: (message: string, hash: any) => void;
  };
  export default parser;
}

declare module '*.css';

/** Canonical editable scores are imported as plain text in lessons and tests. */
declare module '*.vextab' {
  const source: string;
  export default source;
}
