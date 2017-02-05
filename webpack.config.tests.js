const path = require('path');

module.exports = {
  entry: './tests/vextab_tests.coffee',
  output: {
    filename: './build/vextab-tests.js',
    library: 'VexTabTests',
    libraryTarget: 'umd',
  },
  node: {
    fs: 'empty', // jison build workaround
  },
  module: {
    rules: [
      {
        test: /\.coffee/,
        include: [
          path.resolve(__dirname, 'tests'),
          path.resolve(__dirname, 'src'),
        ],
        loader: 'coffee-loader',
      },
      {
        test: /\.jison$/,
        loader: 'jison-loader',
      },
    ],
  },
};
