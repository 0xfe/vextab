// Build the browser library, its legacy entry point, and the interactive test pages.
const path = require('node:path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { version } = require('./package.json');

module.exports = (env = {}) => {
  const tag = env.TAG_NAME || 'dev';
  // Repository examples load ../dist or /dist when served from a checkout. Their
  // packaged copies sit one level below the bundles and use the current build tag.
  function examplePage(content) {
    return content.toString().replace(/src="(?:\.\.)?\/dist\/([^"]+\.js)"/g, (_, bundle) =>
      'src="../' + bundle.replace('.dev.js', '.' + tag + '.js') + '"');
  }
  return {
    entry: {
      main: './src/main.ts',
      score: { import: './src/score/parse.ts', layer: 'parser', filename: 'score.cjs', library: { type: 'commonjs-static' } },
      div: './src/auto.ts',
      browser: { import: './src/browser.ts', filename: 'browser.cjs', library: { type: 'commonjs-static' } },
      guide: './guide/app.ts',
      tests: './tests/tests.ts',
      playground: './tests/playground.ts',
      studies: './guide/studies.ts',
      legacy: {
        import: './src/legacy.ts',
        filename: 'vextab-div.js',
        library: { name: 'VexTabDiv', type: 'umd' },
      },
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: `[name].${tag}.js`,
      library: { name: 'vextab', type: 'umd' },
    },
    devtool: tag === 'prod' ? 'hidden-source-map' : false,
    plugins: [
      new webpack.ProvidePlugin({ $: 'zepto-webpack' }),
      new webpack.DefinePlugin({ __VERSION: JSON.stringify(version) }),
      new HtmlWebpackPlugin({ template: './guide/index.html', filename: 'guide/index.html', chunks: ['guide'] }),
      new HtmlWebpackPlugin({ template: './guide/triplets.html', filename: 'guide/triplets.html', chunks: ['div'] }),
      new HtmlWebpackPlugin({ template: './guide/shared-score.html', filename: 'guide/shared-score.html', chunks: ['main'] }),
      new HtmlWebpackPlugin({ template: './guide/studies.html', filename: 'guide/studies.html', chunks: ['studies'] }),
      new HtmlWebpackPlugin({ template: './tests/tests.html', filename: 'tests.html', chunks: ['tests'] }),
      new HtmlWebpackPlugin({ template: './tests/playground.html', filename: 'playground.html', chunks: ['playground'] }),
      new HtmlWebpackPlugin({ template: './static/div.html', filename: 'static/div.html', chunks: ['div'] }),
      new CopyPlugin({ patterns: [
        ...['bravura', 'academico'].map(face => ({
          from: require.resolve('@vexflow-fonts/' + face + '/LICENSE.txt'),
          to: 'guide/licenses/' + face + '.txt',
        })),
        { from: 'static/index.html', to: 'index.html' },
        { from: 'demos/*.html', transform: examplePage },
        { from: 'doc/tutorial.html', to: 'doc/tutorial.html', transform: examplePage },
        { from: 'doc/*.css' },
        { from: 'guide/scores', to: 'guide/scores' },
        { from: 'doc/vextab.css', to: 'vextab.css' },
        { from: require.resolve('qunit'), to: 'qunit.js' },
        { from: require.resolve('qunit/qunit/qunit.css'), to: 'qunit.css' },
      ] }),
    ],
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: { rules: [
      // A standalone parser needs VexFlow's music tables but never loads engraving fonts.
      { issuerLayer: 'parser', resolve: { alias: { 'vexflow$': 'vexflow/core' } } },
      { test: /\.otf$/, type: 'asset/bytes' },
      { test: /\.vextab$/, type: 'asset/source' },
      { test: /\.ts$/, loader: 'esbuild-loader', options: { target: 'es2019' } },
      { test: /\.jison$/, loader: path.resolve(__dirname, 'scripts/jison-loader.cjs') },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
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
