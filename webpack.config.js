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
  // Repository examples load ../dist or /dist when served from a checkout. Their
  // packaged copies sit one level below the bundles and use the current build tag.
  function examplePage(content) {
    return content.toString().replaceAll('href="../dist/', 'href="../').replace(/src="(?:\.\.)?\/dist\/([^"]+\.js)"/g, (_, bundle) =>
      'src="../' + bundle.replace('.dev.js', '.' + tag + '.js') + '"');
  }
  return {
    entry: {
      ...guideEntries,
      'guide-syntax': { import: './guide/highlight.ts', library: { name: 'VexTabSyntax', type: 'umd' } },
      'example-audio': { import: './guide/example-audio.ts', library: { name: 'VexTabAudio', type: 'umd' } },
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
        template: './guide/' + name + '.html', filename: guidePrefix + name + '.html', chunks: ['triplets', 'shared-score'].includes(name) ? [entry, 'example-audio', 'guide-syntax'] : [entry],
      })),
      ...(!guideSite ? [
        new HtmlWebpackPlugin({ template: './tests/tests.html', filename: 'tests.html', chunks: ['tests'] }),
        new HtmlWebpackPlugin({ template: './tests/playground.html', filename: 'playground.html', chunks: ['playground'] }),
        new HtmlWebpackPlugin({ template: './static/div.html', filename: 'static/div.html', chunks: ['div', 'example-audio'] }),
      ] : []),
      new CopyPlugin({ patterns: [
        ...['bravura', 'academico'].map(face => ({
          from: require.resolve('@vexflow-fonts/' + face + '/LICENSE.txt'),
          to: guidePrefix + 'licenses/' + face + '.txt',
        })),
        ...['spessasynth_lib', 'spessasynth_core'].map(pkg => ({
          from: require.resolve(pkg + '/LICENSE'), to: guidePrefix + 'licenses/' + pkg + '.txt',
        })),
        { from: require.resolve('prismjs/LICENSE'), to: guidePrefix + 'licenses/prismjs.txt' },
        { from: 'guide/audio/README.md', to: guidePrefix + 'licenses/florestan.txt' },
        { from: 'guide/scores', to: guidePrefix + 'scores' },
        // Include the licensed title font for guides opened directly from disk.
        { from: 'guide/fonts', to: 'fonts' },
        ...(!guideSite ? [
          { from: 'static/index.html', to: 'index.html' },
          { from: 'experiments/grammarv2/preview.mjs', to: 'experiments/grammarv2/preview.mjs' },
          { from: 'experiments/grammarv2/preview.html', to: 'experiments/grammarv2/preview.html', transform: content =>
            content.toString().replace('../../dist/main.dev.js', '../../main.' + tag + '.js') },
          { from: 'demos/*.html', transform: examplePage },
          { from: 'doc/*.html', transform: examplePage },
          { from: 'doc/*.css' },
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
      { test: /[\\/]vexflow[\\/]build[\\/]esm[\\/]src[\\/](publication|factory|continuouslayout)\.js$/, loader: path.resolve(__dirname, 'scripts/vexflow-publication-loader.cjs') },
      { resourceQuery: /guide-content/, type: 'asset/source' },
      { test: /\.(otf|sf2)$/, type: 'asset/bytes' },
      { test: /\.vextab$/, type: 'asset/source' },
      { test: /\.m?ts$/, loader: 'esbuild-loader', options: { loader: 'ts', target: 'es2019' } },
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
