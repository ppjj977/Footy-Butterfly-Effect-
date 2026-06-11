import { defineConfig } from 'vitest/config';

// Engine tests are pure TypeScript (no JSX/DOM), so they run in a plain node
// environment with no Vite plugins.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
