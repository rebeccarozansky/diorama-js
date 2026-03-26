// Type declarations for optional/lazy-loaded dependencies.
// These are not installed during development — they're loaded
// at runtime from CDN or by the end user.

declare module 'esbuild-wasm' {
  export function initialize(options: { wasmURL: string }): Promise<void>;
  export function transform(
    source: string,
    options: Record<string, unknown>,
  ): Promise<{ code: string; warnings: unknown[] }>;
}
