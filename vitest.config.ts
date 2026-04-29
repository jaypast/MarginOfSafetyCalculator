import { defineConfig } from 'vitest/config';
import path from 'path';

// Vitest is intentionally configured separately from `vite.config.ts` so the
// dev server / build pipeline are untouched. Aliases mirror the production
// build so `@/...`, `@shared/...`, and `@assets/...` imports resolve in tests.
export default defineConfig({
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
