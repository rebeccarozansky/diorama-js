import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: __dirname,
  base: '/diorama-js/',
  plugins: [],
  resolve: {
    alias: {
      'diorama-js': path.resolve(__dirname, '../../src/index.ts'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist-demo'),
    emptyOutDir: true,
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
