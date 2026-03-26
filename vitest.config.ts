import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Vite plugin that marks `esbuild-wasm` as external so the import-analysis
 * plugin doesn't try to resolve the bare specifier. esbuild-wasm is
 * lazy-loaded at runtime from a CDN and is never bundled.
 */
function externalEsbuild(): Plugin {
  return {
    name: 'external-esbuild-wasm',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'esbuild-wasm') {
        return { id: source, external: true };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [externalEsbuild()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/adapters/**'],
    },
    setupFiles: [],
  },
});
