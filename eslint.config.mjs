import tseslint from 'typescript-eslint';
import config from 'eslint-config-final';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      'dist/',
      'out/**',
      '.vscode-test/**',
      'bin/**',
      'eslint.config.mjs'
    ],
  },
  {
    files: ['**/*.ts'],

    extends: [
      ...config.typescript,
    ],

    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',

      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  }
);
