declare module '*.jison' {
  const parser: {
    parse: (input: string) => any;
    parseError?: (message: string, hash: any) => void;
  };
  export default parser;
}

declare module 'vexflow' {
  const VexFlow: any;
  export default VexFlow;
}
