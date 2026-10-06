import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Relative asset paths so the build works at https://<user>.github.io/<repo>/ without configuration.
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.resolve(dir, '../shared') },
  },
  server: {
    fs: { allow: [path.resolve(dir, '..')] },
  },
});
