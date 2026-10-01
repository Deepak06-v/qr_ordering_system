import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
      include: ['src/**/*.test.{ts,tsx}'],
      environmentOptions: {
        // MSW resolves relative handler paths against the document URL, so this
        // must match the API origin the client is pointed at below.
        jsdom: { url: 'http://localhost:5173' },
      },
      env: {
        // jsdom's fetch cannot resolve a relative URL, so the API client is
        // pointed at an absolute origin. Same code path as production.
        VITE_API_BASE_URL: 'http://localhost:5173',
      },
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
      },
    },
  }),
);
