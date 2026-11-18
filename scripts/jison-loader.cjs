// Compile the checked-in VexTab grammar at build time.
const { Generator } = require('@lahmatiy/jison');

module.exports = function compileGrammar(source) {
  return new Generator(source).generateModule('esm');
};
