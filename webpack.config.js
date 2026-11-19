// Build the browser library, its legacy entry point, and the interactive test pages.
const path = require('node:path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { version } = require('./package.json');

module.exports = (env = {}) => {
  const guideSite = Boolean(env.guideSite);
  const tag = env.TAG_NAME || 'dev';
  const guidePrefix = guideSite ? '' : 'guide/';
  const guideEntries = { guide: './guide/app.ts', div: './src/auto.ts', main: './src/main.ts', studies: './guide/studies.ts' };
  const guidePages = { index: 'guide', triplets: 'div', 'shared-score': 'main', studies: 'studies' };
  return {
    entry: {
      ...guideEntries,
      ...(!guideSite && {
        score: { import: './src/score/parse.ts', layer: 'parser', filename: 'score.cjs', library: { type: 'commonjs-static' } },
        browser: { import: './src/browser.ts', filename: 'browser.cjs', library: { type: 'commonjs-static' } },
        tests: './tests/tests.ts',
        playground: './tests/playground.ts',
        legacy: {
          import: './src/legacy.ts',
          filename: 'vextab-div.js',
          library: { name: 'VexTabDiv', type: 'umd' },
        },
      }),
    },
    output: {
      path: path.resolve(__dirname, guideSite ? 'build/guide' : 'dist'),
      clean: guideSite,
      filename: guideSite ? 'assets/[name].[contenthash:16].js' : `[name].${tag}.js`,
      library: { name: 'vextab', type: 'umd' },
    },
    devtool: !guideSite && tag === 'prod' ? 'hidden-source-map' : false,
    plugins: [
      new webpack.ProvidePlugin({ $: 'zepto-webpack' }),
      new webpack.DefinePlugin({ __VERSION: JSON.stringify(version) }),
      ...Object.entries(guidePages).map(([name, entry]) => new HtmlWebpackPlugin({
        template: './guide/' + name + '.html', filename: guidePrefix + name + '.html', chunks: [entry],
      })),
      ...(!guideSite ? [
        new HtmlWebpackPlugin({ template: './tests/tests.html', filename: 'index.html', chunks: ['tests'] }),
        new HtmlWebpackPlugin({ template: './tests/playground.html', filename: 'playground.html', chunks: ['playground'] }),
        new HtmlWebpackPlugin({ template: './static/div.html', filename: 'static/div.html', chunks: ['div'] }),
      ] : []),
      new CopyPlugin({ patterns: [
        ...['bravura', 'academico'].map(face => ({
          from: require.resolve('@vexflow-fonts/' + face + '/LICENSE.txt'),
          to: guidePrefix + 'licenses/' + face + '.txt',
        })),
        { from: 'guide/scores', to: guidePrefix + 'scores' },
        // The stylesheet lives under assets/ in both the package and the hosted build.
        { from: 'guide/fonts', to: 'fonts' },
        ...(!guideSite ? [
          { from: 'doc/vextab.css', to: 'vextab.css' },
          { from: require.resolve('qunit'), to: 'qunit.js' },
          { from: require.resolve('qunit/qunit/qunit.css'), to: 'qunit.css' },
        ] : []),
      ] }),
    ],
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: { rules: [
      // A standalone parser needs VexFlow's music tables but never loads engraving fonts.
      { issuerLayer: 'parser', resolve: { alias: { 'vexflow$': 'vexflow/core' } } },
      { resourceQuery: /guide-content/, type: 'asset/source' },
      { test: /\.otf$/, type: 'asset/bytes' },
      { test: /\.vextab$/, type: 'asset/source' },
      { test: /\.ts$/, loader: 'esbuild-loader', options: { target: 'es2019' } },
      { test: /\.jison$/, loader: path.resolve(__dirname, 'scripts/jison-loader.cjs') },
      // One stylesheet serves the guide and its three standalone lessons.
      { test: /\.css$/, oneOf: [
        { include: path.resolve(__dirname, 'guide/style.css'), type: 'asset/resource', generator: { filename: 'assets/guide.[contenthash:16].css' } },
        { use: ['style-loader', 'css-loader'] },
      ] },
    ] },
    // Poll source files on platforms with low native file-watcher limits.
    watchOptions: { poll: 1000, ignored: /node_modules/ },
    devServer: {
      host: '127.0.0.1',
      port: 9005,
      // Webpack watches the source assets. Watching its output again exhausts file handles.
      static: { directory: path.resolve(__dirname, 'dist'), watch: false },
    },
  };
};
