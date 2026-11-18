// Build the browser library, its legacy entry point, and the interactive test pages.
const path = require('node:path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { version } = require('./package.json');

module.exports = (env = {}) => {
  const tag = env.TAG_NAME || 'dev';
  return {
    entry: {
      main: './src/main.ts',
      div: './src/div.ts',
      tests: './tests/tests.ts',
      playground: './tests/playground.ts',
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
      new HtmlWebpackPlugin({ template: './tests/tests.html', filename: 'index.html', chunks: ['tests'] }),
      new HtmlWebpackPlugin({ template: './tests/playground.html', filename: 'playground.html', chunks: ['playground'] }),
      new HtmlWebpackPlugin({ template: './static/div.html', filename: 'static/div.html', chunks: ['div'] }),
      new CopyPlugin({ patterns: [
        { from: 'doc/vextab.css', to: 'vextab.css' },
        { from: require.resolve('qunit'), to: 'qunit.js' },
        { from: require.resolve('qunit/qunit/qunit.css'), to: 'qunit.css' },
      ] }),
    ],
    resolve: { extensions: ['.ts', '.js', '.json'] },
    module: { rules: [
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
