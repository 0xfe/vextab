declare module '*.jison' {
  const parser: {
    parse: (input: string) => any;
    parseError?: (message: string, hash: any) => void;
  };
  export default parser;
}

declare module 'lodash' {
  const lodash: any;
  export = lodash;
}

declare module 'vexflow' {
  const VexFlow: any;
  export default VexFlow;
}
