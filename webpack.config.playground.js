const path = require('path');

module.exports = {
  entry: './tests/playground.js',
  output: {
    filename: './build/playground.js',
  },
  module: {
    rules: [
      {
        test: /\.js/,
        include: [
          path.resolve(__dirname, 'tests'),
        ],
        loader: 'babel-loader',
      },
    ],
  },
};
