const path = require('path');

module.exports = {
  entry: './src/main.coffee',
  output: {
    filename: './lib/vextab.js',
    libraryTarget: 'commonjs2',
  },
  node: {
    fs: 'empty', // jison build workaround
  },
  externals: {
    lodash: 'lodash',
    vexflow: 'vexflow',
  },
  module: {
    rules: [
      {
        test: /\.coffee/,
        include: [
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
