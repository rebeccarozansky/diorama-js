import { defineConfig } from 'tsup';

export default defineConfig([
  // Core library
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    target: 'es2022',
    splitting: true,
    outDir: 'dist',
  },
  // React adapter
  {
    entry: { react: 'src/adapters/react.tsx' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    treeshake: true,
    minify: false,
    target: 'es2022',
    outDir: 'dist',
    external: ['react', 'react-dom'],
    banner: { js: '"use client";' },
  },
  // Vue adapter
  {
    entry: { vue: 'src/adapters/vue.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    treeshake: true,
    minify: false,
    target: 'es2022',
    outDir: 'dist',
    external: ['vue'],
  },
  // Svelte adapter
  {
    entry: { svelte: 'src/adapters/svelte.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    treeshake: true,
    minify: false,
    target: 'es2022',
    outDir: 'dist',
    external: ['svelte'],
  },
]);
