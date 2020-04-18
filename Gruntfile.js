// Gruntfile for VexTab.
// Mohit Muthanna Cheppudira <mohit@muthanna.com>

const webpackConfig = require('./webpack.config.js');

module.exports = (grunt) => {
  const BUILD_DIR = 'dist';
  const RELEASE_DIR = 'releases';

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    webpack: {
      options: {
        stats: !process.env.NODE_ENV || process.env.NODE_ENV === 'development',
      },
      prod: { ...webpackConfig({ TAG_NAME: 'prod' }), mode: 'production' },
      dev: { ...webpackConfig({ TAG_NAME: 'dev' }), mode: 'development' },
    },
    coffeelint: {
      files: ['src/*.coffee'],
      options: {
        no_trailing_whitespace: { level: 'error' },
        max_line_length: { level: 'ignore' },
      },
    },
    copy: {
      release: {
        files: [
          {
            expand: true,
            dest: RELEASE_DIR,
            cwd: BUILD_DIR,
            src: ['*.js', '*.map'],
          },
        ],
      },
    },
    gitcommit: {
      releases: {
        options: {
          message: 'Committing release binaries for new version: <%= pkg.version %>',
          verbose: true,
        },
        files: [
          {
            src: [`${RELEASE_DIR}/div.*.js`, `${RELEASE_DIR}/div.*.map`],
            expand: true,
          },
        ],
      },
    },
    bump: {
      options: {
        files: ['package.json'], // Add component.json here
        commitFiles: ['package.json'], // Add component.json here
        updateConfigs: ['pkg'],
        createTag: false,
        push: false,
      },
    },
    release: {
      options: {
        bump: false,
        commit: false,
        npm: true, // switch to false once there's 2FA
      },
    },
    clean: [BUILD_DIR, RELEASE_DIR],
  });

  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-release');
  grunt.loadNpmTasks('grunt-bump');
  grunt.loadNpmTasks('grunt-git');
  grunt.loadNpmTasks('grunt-coffeelint');
  grunt.loadNpmTasks('grunt-webpack');


  // Default task(s).
  grunt.registerTask('default', ['lint', 'build']);

  grunt.registerTask('lint', 'Run linter on all coffeescript code.', () => {
    grunt.task.run('coffeelint');
  });

  grunt.registerTask('build', 'Build library.', () => {
    grunt.task.run('webpack:prod');
    grunt.task.run('webpack:dev');
  });

  grunt.registerTask('alldone', 'Publish VexTab NPM.', () => {
    grunt.log.ok('All done!');
  });

  // Increment package version generate releases
  grunt.registerTask('publish', 'Generate releases.',
    ['bump', 'default', 'copy:release', 'gitcommit:releases', 'release', 'alldone']);
};
