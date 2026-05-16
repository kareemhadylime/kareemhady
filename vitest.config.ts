import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Global cleanup after each test: replaces per-file afterEach(cleanup) calls.
    // @testing-library/react normally auto-installs this when vitest globals are
    // enabled; since we keep globals: false, we wire it here instead.
    setupFiles: ['src/__mocks__/vitest-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 'server-only' is a Next.js guard that throws at import time in non-server
      // environments. Alias it to an empty shim so pure-logic unit tests can
      // import modules that carry the guard without Next.js scaffolding.
      'server-only': path.resolve(__dirname, 'src/__mocks__/server-only.ts'),
      // 'next/cache' calls (revalidatePath, revalidateTag, etc.) require the
      // Next.js request context and throw in plain Vitest. Shim them out.
      'next/cache': path.resolve(__dirname, 'src/__mocks__/next-cache.ts'),
    },
  },
});
