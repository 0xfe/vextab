const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { GitRevisionPlugin } = require('git-revision-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');

module.exports = (env) => {
  // eslint-disable-next-line
  env = env || {};
  const tag = env.TAG_NAME || process.env.TAG_NAME || 'dev';
  const hasTag = typeof tag !== 'undefined' && tag !== '';
  const gitRevisionPlugin = new GitRevisionPlugin();

  return {
    plugins: [
      new ESLintPlugin({
        extensions: ['js', 'ts'],
        fix: true,
      }),
      new (require('webpack').ProvidePlugin)({
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
      new CopyPlugin({
        patterns: [{ from: 'static/*', to: '', noErrorOnMissing: true }],
        // Always copy (for --watch / webpack-dev-server). Needed
        // because CleanWebpackPlugin wipes everything out.
      }),
      new (require('webpack').DefinePlugin)({
        NODE_ENV: JSON.stringify(env.NODE_ENV),
        __VERSION: JSON.stringify(gitRevisionPlugin.version()),
        __COMMITHASH: JSON.stringify(gitRevisionPlugin.commithash()),
        __BRANCH: JSON.stringify(gitRevisionPlugin.branch()),
      }),
    ],
    devtool: tag === 'prod' ? 'hidden-source-map' : false,
    entry: {
      main: './src/main.ts',
      div: './src/div.ts',
      tests: './tests/tests.ts',
      playground: './tests/playground.ts',
    },
    output: {
      library: 'vextab',
      libraryTarget: 'umd',
      filename: hasTag ? `[name].${tag}.js` : '[name].[contenthash].js',
      path: path.resolve(__dirname, 'dist'),
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
      fallback: {
        fs: false,
        path: false,
      },
    },
    module: {
      rules: [
        { test: /\.jsx?$/, exclude: /node_modules/, use: [{ loader: 'babel-loader' }] },
        { test: /\.tsx?$/, exclude: /node_modules/, use: [{ loader: 'ts-loader', options: { transpileOnly: true } }] },
        { test: /\.jison$/, use: [{ loader: 'jison-loader' }] },
        { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      ],
    },
    devServer: {
      static: {
        directory: path.join(__dirname, 'dist'),
      },
      port: 9005,
      open: false,
      allowedHosts: 'all',
      client: {
        overlay: false,
      },
    },
  };
};
