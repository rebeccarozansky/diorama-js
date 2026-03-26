import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [],
  resolve: {
    alias: {
      'diorama-js': path.resolve(__dirname, '../../src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        docs: path.resolve(__dirname, 'docs.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
