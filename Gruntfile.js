// Gruntfile for VexTab.
// Mohit Muthanna Cheppudira <mohit@muthanna.com>

module.exports = function(grunt) {
  var L = grunt.log.writeln;
  var BANNER = '/**\n' +
                ' * VexTab <%= pkg.version %> built on <%= grunt.template.today("yyyy-mm-dd") %>.\n' +
                ' * Copyright (c) 2010 Mohit Muthanna Cheppudira <mohit@muthanna.com>\n' +
                ' *\n' +
                ' * http://www.vexflow.com  http://github.com/0xfe/vextab\n' +
                ' */\n';

  var BUILD_DIR = 'build',
      DOC_DIR = "doc",
      RELEASE_DIR = 'releases',
      TARGET_RAW = BUILD_DIR + '/vextab-debug.js',
      TARGET_MIN = BUILD_DIR + '/vextab-min.js';

  var COFFEE_SOURCES = ["src/vextab.coffee", "src/artist.coffee"],
      COFFEE_OUT = BUILD_DIR + "/vextab.js",

      JISON_SOURCES = ["src/vextab.jison"],
      JISON_OUT = BUILD_DIR + "/vextab-jison.js",
      JS_SOURCES = [JISON_OUT, COFFEE_OUT, "src/main.js"],

      TEST_SOURCES = ["tests/*.coffee"],
      TEST_OUT = BUILD_DIR + "/vextab-tests.js",

      PLAYER_SOURCES = ["src/player.coffee"],
      PLAYER_OUT = BUILD_DIR + "/vextab-player.js",

      CSS = ["vextab.css"];

  var RELEASE_TARGETS = ["vextab-debug.js", "vextab-min.js", "vextab-min.js.map"];

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    coffeelint: {
      files: COFFEE_SOURCES,
      options: {
        no_trailing_whitespace: { level: 'error' },
        max_line_length: { level: 'ignore' }
      }
    },
    coffee: {
      compile: {
        options: {
          sourceMap: true
        },
        files: [
          { src: COFFEE_SOURCES, dest: COFFEE_OUT },
          { src: PLAYER_SOURCES, dest: PLAYER_OUT },
          { src: TEST_SOURCES, dest: TEST_OUT }
        ]
      }
    },
    jison: {
      compile: {
        options: { moduleType: "js" },
        files: [{src: JISON_SOURCES, dest: JISON_OUT}]
      }
    },
    concat: {
      options: {
        banner: BANNER
      },
      build: {
        src: JS_SOURCES,
        dest: TARGET_RAW
      }
    },
    uglify: {
      options: {
        banner: BANNER,
        sourceMap: true
      },
      build: {
        src: TARGET_RAW,
        dest: TARGET_MIN
      }
    },
    qunit: {
      files: ['tests/runtest.html']
    },
    watch: {
      files: COFFEE_SOURCES + JISON_SOURCES + TEST_SOURCES,
      tasks: ['default']
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

  // Load the plugin that provides the "uglify" task.
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-qunit');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-coffee');
  grunt.loadNpmTasks('grunt-release');
  grunt.loadNpmTasks('grunt-bump');
  grunt.loadNpmTasks('grunt-git');
  grunt.loadNpmTasks('grunt-jison');
  grunt.loadNpmTasks('grunt-coffeelint');

  // Default task(s).
  grunt.registerTask('default', ['coffeelint', 'coffee', 'jison', 'concat', 'uglify']);

  grunt.registerTask('test', 'Run qunit tests.', function() {
    grunt.task.run('qunit');
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
