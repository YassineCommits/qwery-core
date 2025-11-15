import eslintConfigBase from '@qwery/eslint-config/base.js';
import { defineConfig } from 'eslint/config';

export default defineConfig(eslintConfigBase, {
  ignores: ['**/shadcn/**', '**/ai-elements/**'],
});
