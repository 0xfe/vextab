// Build the browser library, its legacy entry point, and the interactive test pages.
const path = require('node:path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { version, dependencies } = require('./package.json');

// The hosted site shares pinned CDN scripts. Checkout pages load the installed engine offline.
class GuideDependencies {
  constructor(hosted) { this.hosted = hosted; }
  apply(compiler) {
    compiler.hooks.compilation.tap('GuideDependencies', compilation => {
      HtmlWebpackPlugin.getHooks(compilation).alterAssetTagGroups.tap('GuideDependencies', tags => {
        if (tags.outputName.endsWith('gallery/index.html')) return tags;
        const local = path.posix.relative(path.posix.dirname(tags.outputName), 'vexflow.js');
        const scripts = this.hosted ? [
          'https://cdn.jsdelivr.net/npm/vexflow@' + dependencies.vexflow + '/build/cjs/vexflow.js',
          'https://cdn.jsdelivr.net/npm/vextab@' + version + '/dist/runtime/vextab.js',
        ] : [local];
        tags.headTags.unshift(...scripts.map(src => ({
          tagName: 'script', voidTag: false, attributes: { src, defer: true },
        })));
        return tags;
      });
    });
  }
}

// Preserve the synchronous config API used by engineering reports for ordinary host builds.
module.exports = (env = {}) => {
  if (!env.guideSite && !env.WEBPACK_SERVE) return configuration(env);
  return import('./guide/gallery/build.mjs')
    .then(async ({ prepareGallery }) => configuration(env, await prepareGallery()));
};

function configuration(env, gallery) {
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
      ...(guideSite ? { guide: guideEntries.guide, studies: guideEntries.studies } : guideEntries),
      'guide-syntax': { import: './guide/highlight.ts', library: { name: 'VexTabSyntax', type: 'umd' } },
      'example-audio': { import: './guide/example-audio.ts', library: { name: 'VexTabAudio', type: 'umd' } },
      ...(!guideSite && {
        performer: { import: './src/playback/performer.ts', filename: 'performer.cjs', library: { type: 'commonjs-static' } },
        score: { import: './src/score/parse.ts', layer: 'npm', filename: 'score.cjs', library: { type: 'commonjs-static' } },
        browser: { import: './src/browser.ts', layer: 'npm', filename: 'browser.cjs', library: { type: 'commonjs-static' } },
        tests: './tests/tests.ts',
        playground: './tests/playground.ts',
        legacy: {
          import: './src/legacy.ts',
          filename: 'vextab-div.js',
          library: { name: 'VexTabDiv', type: 'umd' },
        },
      }),
    },
    externals: [({ request, contextInfo }, done) => {
      if (request === 'vexflow') return done(null, contextInfo.issuerLayer === 'npm'
        ? 'commonjs vexflow' : 'var globalThis.VexFlow');
      if (guideSite && request?.endsWith('/src/browser')) return done(null, 'var globalThis.vextab');
      done();
    }],
    output: {
      path: path.resolve(__dirname, guideSite ? 'build/guide' : 'dist'),
      clean: guideSite,
      filename: guideSite ? 'assets/[name].[contenthash:16].js' : `[name].${tag}.js`,
      library: guideSite ? undefined : { name: 'vextab', type: 'umd' },
    },
    devtool: !guideSite && tag === 'prod' ? 'hidden-source-map' : false,
    plugins: [
      new GuideDependencies(guideSite),
      new webpack.ProvidePlugin({ $: 'zepto-webpack' }),
      new webpack.DefinePlugin({ __VERSION: JSON.stringify(version), __IMPORT_CDN: JSON.stringify(guideSite ? 'https://cdn.jsdelivr.net/npm/vextab@' + version + '/dist/runtime/import/' : '') }),
      ...Object.entries(guidePages).map(([name, entry]) => new HtmlWebpackPlugin({
        importingAssets: Boolean(gallery), template: './guide/' + name + '.html', filename: guidePrefix + name + '.html', chunks: ['triplets', 'shared-score'].includes(name) ? [entry, 'example-audio', 'guide-syntax'] : [entry],
      })),
      ...(gallery ? gallery.pages.map(name => new HtmlWebpackPlugin({
        templateContent: require('node:fs').readFileSync(path.join(gallery.out, name + '.html'), 'utf8'),
        filename: guidePrefix + 'gallery/' + name + '.html', chunks: name === 'index' ? [] : ['main'],
        inject: 'head', minify: false,
      })) : []),
      ...(!guideSite ? [
        new HtmlWebpackPlugin({ template: './tests/tests.html', filename: 'tests.html', chunks: ['tests'] }),
        new HtmlWebpackPlugin({ template: './tests/playground.html', filename: 'playground.html', chunks: ['playground'] }),
        new HtmlWebpackPlugin({ template: './static/div.html', filename: 'static/div.html', chunks: ['div', 'example-audio'] }),
      ] : []),
      new CopyPlugin({ patterns: [
        ...(gallery ? [
          { from: gallery.out, to: guidePrefix + 'gallery', globOptions: { ignore: ['**/*.html'] } },
          { from: 'importer/THIRD-PARTY.txt', to: guidePrefix + 'licenses/importer-third-party.txt' },
          { from: 'importer/LICENSE', to: guidePrefix + 'licenses/importer.txt' },
        ] : []),
        ...['bravura', 'academico', 'petaluma', 'petalumascript'].map(face => ({
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
          { from: require.resolve('vexflow'), to: 'vexflow.js' },
          { from: 'static/index.html', to: 'index.html' },
          { from: 'experiments/grammarv2/preview.mjs', to: 'experiments/grammarv2/preview.mjs' },
          { from: 'experiments/grammarv2/preview.html', to: 'experiments/grammarv2/preview.html', transform: content =>
            content.toString().replace('../../dist/vexflow.js', '../../vexflow.js').replace('../../dist/main.dev.js', '../../main.' + tag + '.js') },
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
}
