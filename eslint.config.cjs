const js = require('@eslint/js');
const globals = require('globals');
const importPlugin = require('eslint-plugin-import');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

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
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['dist/**', 'releases/**', 'node_modules/**', 'vexflow/**'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: tsParser,
      globals: {
        ...globals.browser,
        ...globals.jquery,
        ...globals.mocha,
        MIDI: 'readonly',
        QUnit: 'readonly',
        paper: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'max-len': ['warn', 180, 2, { ignoreComments: true }],
      'prefer-destructuring': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
];
