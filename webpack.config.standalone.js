const path = require('path');

module.exports = {
  entry: './src/main.coffee',
  output: {
    filename: './build/vextab-div.js',
    library: 'VexTabDiv',
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
