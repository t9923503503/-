import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'web'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js', 'tests/unit/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
  },
});

