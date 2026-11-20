// Run the measured revision's webpack and loaders. Instrument only the separate coverage build.
const { createRequire } = require('node:module');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const project = createRequire(join(process.cwd(), 'package.json'));
const webpack = project('webpack');
const coverage = process.argv[2] === 'coverage';
const tag = coverage ? 'dev' : 'prod';
const config = project('./webpack.config.js')({ TAG_NAME: tag, NODE_ENV: coverage ? 'development' : 'production' });
config.mode = coverage ? 'development' : 'production';
// A formatter bundled with 4.0.x can rewrite the measured source as a build side effect.
config.plugins = config.plugins.filter((plugin) => plugin.constructor.name !== 'ESLintWebpackPlugin');
if (coverage) {
  const sources = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'));
  config.entry = { tests: config.entry.tests, population: sources.map((file) => './' + file) };
  config.plugins = config.plugins.filter((plugin) =>
    ['ProvidePlugin', 'DefinePlugin'].includes(plugin.constructor.name),
  );
  config.output.path = join(process.cwd(), 'coverage-build');
  config.devtool = false;
  config.module.rules.push({
    enforce: 'post',
    test: /\.ts$/,
    include: join(process.cwd(), 'src'),
    use: [join(__dirname, 'instrument.cjs')],
  });
}
webpack(config, (err, stats) => {
  if (err || stats.hasErrors()) {
    console.error(err ?? stats.toString({ all: false, errors: true, errorDetails: true }));
    process.exitCode = 1;
  }
});
