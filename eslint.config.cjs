const js = require('@eslint/js');
const globals = require('globals');
const importPlugin = require('eslint-plugin-import');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    ignores: ['dist/**', 'releases/**', 'node_modules/**', 'vexflow/**'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.jquery,
        ...globals.mocha,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      'max-len': ['warn', 180, 2, { ignoreComments: true }],
      'prefer-destructuring': 'off',
    },
  },
];
