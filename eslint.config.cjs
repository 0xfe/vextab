const js = require('@eslint/js');
const globals = require('globals');
const importPlugin = require('eslint-plugin-import');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    ignores: ['dist/**', 'releases/**', 'node_modules/**', 'support/**', 'vexflow/**'],
  },
  js.configs.recommended,
  {
    files: ['Gruntfile.js', 'webpack.config.js', 'eslint.config.cjs'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.js'],
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
