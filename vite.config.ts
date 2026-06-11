import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Butterfly is a static site (Cloudflare Pages target). Base is relative so it
// can be served from any path. Test config lives in vitest.config.ts.
export default defineConfig({
  base: './',
  plugins: [react()],
});
