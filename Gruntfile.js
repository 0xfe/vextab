// Gruntfile for VexTab.
// Mohit Muthanna Cheppudira <mohit@muthanna.com>
const webpackTests = require('./webpack.config.tests');
const webpackStandalone = require('./webpack.config.standalone');
const webpackPlayground = require('./webpack.config.playground');
const webpackLib = require('./webpack.config');

module.exports = function(grunt) {
  var BANNER = '/**\n' +
                ' * VexTab <%= pkg.version %> built on <%= grunt.template.today("yyyy-mm-dd") %>.\n' +
                ' * Copyright (c) 2010 Mohit Muthanna Cheppudira <mohit@muthanna.com>\n' +
                ' *\n' +
                ' * http://www.vexflow.com  http://github.com/0xfe/vextab\n' +
                ' */\n';

  var BUILD_DIR = 'build',
      DOC_DIR = "doc",
      RELEASE_DIR = 'releases',

      CSS = ["vextab.css"];

  var RELEASE_TARGETS = ["vextab-div.js"];

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    coffeelint: {
      files: ['src/*.coffee'],
      options: {
        no_trailing_whitespace: { level: 'error' },
        max_line_length: { level: 'ignore' }
      }
    },
    qunit: {
      files: ['tests/runtest.html']
    },
    webpack: {
      lib: webpackLib,
      playground: webpackPlayground,
      tests: webpackTests,
      standalone: webpackStandalone
    },
    watch: {
      scripts: {
        files: ['Gruntfile.js', 'src/*', 'tests/*'],
        tasks: ['build', 'playground', 'lint'],
        options: {
          interrupt: true
        }
      }
    },
    copy: {
      release: {
        files: [
          {
            expand: true,
            dest: RELEASE_DIR,
            cwd: BUILD_DIR,
            src: RELEASE_TARGETS
          }
        ]
      },
      css: {
        files: [
          {
            expand: true,
            dest: RELEASE_DIR,
            cwd: DOC_DIR,
            src: CSS
          }
        ]
      }
    },
    gitcommit: {
      releases: {
        options: {
          message: "Committing release binaries for new version: <%= pkg.version %>",
          verbose: true
        },
        files: [
          {
            src: [RELEASE_DIR + "/*.js", RELEASE_DIR + "/*.map", RELEASE_DIR + "/*.css"],
            expand: true
          }
        ]
      }
    },
    bump: {
      options: {
        files: ['package.json'], // Add component.json here
        commitFiles: ['package.json'], // Add component.json here
        updateConfigs: ['pkg'],
        createTag: false,
        push: false
      }
    },
    release: {
      options: {
        bump: false,
        commit: false
      }
    },
    clean: [BUILD_DIR, RELEASE_DIR],
  });

  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-qunit');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-release');
  grunt.loadNpmTasks('grunt-bump');
  grunt.loadNpmTasks('grunt-git');
  grunt.loadNpmTasks('grunt-coffeelint');
  grunt.loadNpmTasks('grunt-webpack');


  // Default task(s).
  grunt.registerTask('default', ['lint', 'build', 'test']);

  grunt.registerTask('build', 'Build library.', function() {
    grunt.task.run('webpack:lib');
    grunt.task.run('webpack:standalone');
    grunt.task.run('webpack:tests');
  });

  grunt.registerTask('lint', 'Run linter on all coffeescript code.', function() {
    grunt.task.run('coffeelint');
  });

  grunt.registerTask('test', 'Run qunit tests.', function() {
    grunt.task.run('qunit');
  });

  grunt.registerTask('playground', 'Build playground.', function() {
    grunt.task.run('webpack:lib');
    grunt.task.run('webpack:playground');
  });

  // Release current build.
  grunt.registerTask('stage', 'Stage current binaries to releases/.', function() {
    grunt.task.run('default');
    grunt.task.run('copy:css');
    grunt.task.run('copy:release');
  });

  // Increment package version and publish to NPM.
  grunt.registerTask('publish', 'Publish VexTab NPM.', function() {
    grunt.task.run('bump');
    grunt.task.run('stage');
    grunt.task.run('test');
    grunt.task.run('gitcommit:releases');
    grunt.task.run('release');
  });
};
