import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vitest is intentionally configured separately from `vite.config.ts` so the
// dev server / build pipeline are untouched. Aliases mirror the production
// build so `@/...`, `@shared/...`, and `@assets/...` imports resolve in tests.
export default defineConfig({
  // Vite 8 respects tsconfig's `jsx: preserve` for .tsx files, which leaves raw
  // JSX in the transformed output and breaks tests that import React components.
  // The React plugin transforms JSX properly for test files too.
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@assets': path.resolve(__dirname, './attached_assets'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'client/src/lib/**/*.ts',
        'shared/**/*.ts',
        'server/services/stockData.ts',
        'server/storage.ts',
      ],
      reporter: ['text', 'html'],
    },
  },
});
