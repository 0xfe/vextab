// Save initial counters even for modules which the browser test suite never loads.
const { createInstrumenter } = require('istanbul-lib-instrument');
const { relative } = require('node:path');
module.exports = function instrument(source) {
  const file = relative(this.rootContext, this.resourcePath).split(require('node:path').sep).join('/');
  const instrumenter = createInstrumenter({ esModules: true });
  const code = instrumenter.instrumentSync(source, file);
  this.emitFile('counters/' + file + '.json', JSON.stringify(instrumenter.lastFileCoverage()));
  return code;
};
