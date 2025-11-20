import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import path from 'path';

const headlessPreference = process.env.VITEST_HEADLESS?.toLowerCase();
const headless =
  headlessPreference === 'false'
    ? false
    : headlessPreference === 'true'
      ? true
      : process.env.CI !== 'false';

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
    },
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    browser: {
      enabled: true,
      headless,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    testTimeout: 300000, // 5 minutes for model loading and inference
    hookTimeout: 300000,
  },
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
    },
  },
});
