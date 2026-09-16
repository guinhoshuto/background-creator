import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {ignores: ['node_modules/**', 'out/**', '.cache/**', 'build/**']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {files: ['**/*.ts', '**/*.tsx'], languageOptions: {globals: {console: 'readonly', process: 'readonly', Buffer: 'readonly'}}},
);
