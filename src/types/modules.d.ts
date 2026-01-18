// src/types/modules.d.ts
// Module declarations for non-TS assets and external libraries used by the build.

declare module '*.jison' {
  // Jison parser modules export a parse method with optional parseError hook.
  const parser: {
    parse: (input: string) => any;
    parseError?: (message: string, hash: any) => void;
  };
  export default parser;
}

declare module 'vexflow' {
  // VexFlow is consumed as a default export in this codebase.
  const VexFlow: any;
  export default VexFlow;
}
