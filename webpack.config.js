const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const GitRevisionPlugin = require('git-revision-webpack-plugin');

module.exports = (env) => {
  // eslint-disable-next-line
  env = env || {};
  const tag = env.TAG_NAME || process.env.TAG_NAME || 'dev';
  const hasTag = typeof tag !== 'undefined' && tag !== '';
  const gitRevisionPlugin = new GitRevisionPlugin();

  return {
    node: {
      fs: 'empty',
    },
    plugins: [
      new webpack.ProvidePlugin({
        $: 'zepto-webpack',
      }),
      new HtmlWebpackPlugin({
        template: './tests/tests.html',
        filename: 'index.html',
        chunks: ['tests'],
      }),
      new HtmlWebpackPlugin({
        template: './tests/playground.html',
        filename: 'playground.html',
        chunks: ['playground'],
      }),
      new CopyPlugin([{ from: 'static/*', flatten: true }], {
        // Always copy (for --watch / webpack-dev-server). Needed
        // because CleanWebpackPlugin wipes everything out.
        copyUnmodified: true,
      }),
      new webpack.DefinePlugin({
        NODE_ENV: JSON.stringify(env.NODE_ENV),
        __VERSION: JSON.stringify(gitRevisionPlugin.version()),
        __COMMITHASH: JSON.stringify(gitRevisionPlugin.commithash()),
        __BRANCH: JSON.stringify(gitRevisionPlugin.branch()),
      }),
    ],
    devtool: tag === 'prod' ? 'hidden-source-map' : false,
    entry: {
      main: './src/main.js',
      div: './src/div.js',
      tests: './tests/tests.coffee',
      playground: './tests/playground.js',
    },
    output: {
      library: 'vextab',
      filename: hasTag ? `[name].${tag}.js` : '[name].[contenthash].js',
      path: path.resolve(__dirname, 'dist'),
    },
    module: {
      rules: [
        { test: /\.jsx?$/, exclude: /node_modules/, use: [{ loader: 'babel-loader' }, { loader: 'eslint-loader', options: { fix: true } }] },
        { test: /\.coffee$/, use: [{ loader: 'coffee-loader' }] },
        { test: /\.jison$/, use: [{ loader: 'jison-loader' }] },
        { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      ],
    },
  };
};
