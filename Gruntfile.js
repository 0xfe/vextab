// Gruntfile for VexTab.
// Mohit Muthanna Cheppudira <mohit@muthanna.com>

module.exports = (grunt) => {
  const BANNER = '/**\n'
                + ' * VexTab <%= pkg.version %> built on <%= grunt.template.today("yyyy-mm-dd") %>.\n'
                + ' * Copyright (c) 2010 Mohit Muthanna Cheppudira <mohit@muthanna.com>\n'
                + ' *\n'
                + ' * http://www.vexflow.com  http://github.com/0xfe/vextab\n'
                + ' */\n';

  const BUILD_DIR = 'build';
  const DOC_DIR = 'doc';
  const RELEASE_DIR = 'releases';

  const JISON_SRC = ['src/vextab.jison'];
  const JISON_OUT = `${BUILD_DIR}/vextab-jison.js`;

  const TABDIV_SRC = ['src/tabdiv.js'];
  const TABDIV_OUT = 'build/vextab-div.js';

  const TEST_SRC = ['tests/vextab_tests.coffee'];
  const TEST_OUT = `${BUILD_DIR}/vextab-tests.js`;

  const CSS = ['vextab.css'];

  const RELEASE_TARGETS = ['vextab-div.js'];

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    coffeelint: {
      files: ['src/*.coffee'],
      options: {
        no_trailing_whitespace: { level: 'error' },
        max_line_length: { level: 'ignore' },
      },
    },
    jison: {
      compile: {
        options: { moduleType: 'commonjs' },
        files: [{ src: JISON_SRC, dest: JISON_OUT }],
      },
    },
    browserify: {
      tests: {
        options: {
          // No need for this because of package.json "browserify" rule.
          // transform: ['coffeeify'],
          browserifyOptions: {
            debug: true,
            standalone: 'VexTabTests',
            transform: [['babelify', { presets: ['@babel/preset-env'] }]],
          },
        },
        files: [
          { src: TEST_SRC, dest: TEST_OUT },
        ],
      },
      tabdiv: {
        options: {
          banner: BANNER,
          browserifyOptions: {
            standalone: 'VexTabDiv',
            transform: [['babelify', { presets: ['@babel/preset-env'] }]],
          },
        },
        files: [
          { src: TABDIV_SRC, dest: TABDIV_OUT },
        ],
      },
      playground: {
        options: {
          // No need for this because of package.json "browserify" rule.
          // transform: ['coffeeify'],
          browserifyOptions: {
            debug: true,
          },
        },
        files: [
          { src: 'tests/playground.js', dest: 'build/playground.js' },
        ],
      },
    },
    qunit: {
      files: ['tests/runtest.html'],
    },
    watch: {
      scripts: {
        files: ['Gruntfile.js', 'src/*', 'tests/*'],
        tasks: ['build', 'playground', 'lint'],
        options: {
          interrupt: true,
        },
      },
    },
    copy: {
      release: {
        files: [
          {
            expand: true,
            dest: RELEASE_DIR,
            cwd: BUILD_DIR,
            src: RELEASE_TARGETS,
          },
        ],
      },
      css: {
        files: [
          {
            expand: true,
            dest: RELEASE_DIR,
            cwd: DOC_DIR,
            src: CSS,
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
            src: [`${RELEASE_DIR}/*.js`, `${RELEASE_DIR}/*.map`, `${RELEASE_DIR}/*.css`],
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
      },
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
  grunt.loadNpmTasks('grunt-jison');
  grunt.loadNpmTasks('grunt-coffeelint');
  grunt.loadNpmTasks('grunt-browserify');

  // Default task(s).
  grunt.registerTask('default', ['lint', 'build', 'test']);

  grunt.registerTask('build', 'Build library.', () => {
    grunt.task.run('jison');
    grunt.task.run('browserify:tabdiv');
    grunt.task.run('browserify:tests');
  });

  grunt.registerTask('lint', 'Run linter on all coffeescript code.', () => {
    grunt.task.run('coffeelint');
  });

  grunt.registerTask('test', 'Run qunit tests.', () => {
    grunt.task.run('qunit');
  });

  grunt.registerTask('playground', 'Build playground.', () => {
    // Make sure vextab is locally linked:
    //   $ npm link
    //   $ npm link vextab
    grunt.task.run('browserify:playground');
  });

  // Release current build.
  grunt.registerTask('stage', 'Stage current binaries to releases/.', () => {
    grunt.task.run('default');
    grunt.task.run('copy:css');
    grunt.task.run('copy:release');
  });

  // Increment package version and publish to NPM.
  grunt.registerTask('publish', 'Publish VexTab NPM.', () => {
    grunt.task.run('bump');
    grunt.task.run('stage');
    grunt.task.run('test');
    grunt.task.run('gitcommit:releases');
    grunt.task.run('release');
  });
};
