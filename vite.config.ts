import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // `--host` in the dev script binds 0.0.0.0 so a phone on the same
    // network can open the game and we can test real touch input.
    port: 5173,
    strictPort: false,
  },
  build: {
    target: 'es2022',
  },
});
