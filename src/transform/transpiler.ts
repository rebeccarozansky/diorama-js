import { TranspileError, TranspilerLoadError } from '../errors';
import type { Framework } from '../types';

// ─── Lazy-loaded esbuild reference ─────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let esbuildModule: any = null;
let esbuildReady: Promise<void> | null = null;

/** Default CDN base for esbuild-wasm (JS + WASM binary). */
const ESBUILD_CDN = 'https://esm.sh/esbuild-wasm@0.24.0';

/**
 * Ensure esbuild-wasm is downloaded and initialized.
 * Only fetches the ~8 MB WASM binary on first call.
 *
 * The JS module is loaded from a CDN URL (not a bare specifier) so that
 * it works in every browser context — including Vite / Webpack dev
 * servers that would otherwise try to resolve `esbuild-wasm` through
 * their own module graphs and fail.
 */
async function ensureEsbuild(wasmURL?: string): Promise<void> {
  if (!esbuildReady) {
    esbuildReady = (async () => {
      try {
        // Dynamic import from CDN — avoids bundler/dev-server interception
        const mod = await import(/* @vite-ignore */ ESBUILD_CDN);
        // esm.sh may wrap the module — handle both `mod.default` and `mod`
        esbuildModule = mod.default ?? mod;

        const resolvedURL =
          wasmURL && wasmURL !== 'auto'
            ? wasmURL
            : `${ESBUILD_CDN}/esbuild.wasm`;

        await esbuildModule.initialize({ wasmURL: resolvedURL });
      } catch (err) {
        // Reset so a subsequent call can retry
        esbuildReady = null;
        esbuildModule = null;
        throw new TranspilerLoadError(
          err instanceof Error ? err.message : 'Failed to load esbuild-wasm.',
        );
      }
    })();
  }
  return esbuildReady;
}

// ─── Public API ────────────────────────────────────────────────

export interface TranspileOptions {
  /** File path (used for error messages and loader detection). */
  filePath: string;
  /** Source code to transform. */
  source: string;
  /** Detected framework — determines JSX transform settings. */
  framework?: Framework;
  /** Custom esbuild-wasm URL (or `'auto'`). */
  esbuildWasmURL?: string;
}

export interface TranspileResult {
  /** Transpiled JavaScript code. */
  code: string;
}

/**
 * Transpile a single JSX / TSX / TS file to plain JavaScript
 * using esbuild-wasm.
 */
export async function transpileFile(options: TranspileOptions): Promise<TranspileResult> {
  const { filePath, source, framework = 'none', esbuildWasmURL } = options;

  await ensureEsbuild(esbuildWasmURL);

  const loader = loaderFor(filePath);
  const jsxConfig = jsxConfigFor(framework, loader);

  try {
    const result = await esbuildModule.transform(source, {
      loader,
      ...jsxConfig,
      target: 'es2022',
      format: 'esm',
      charset: 'utf8',
    });

    return { code: result.code as string };
  } catch (err: unknown) {
    // Extract structured error info from esbuild
    const msg = err instanceof Error ? err.message : String(err);
    // esbuild errors often contain "ERROR: <message>" with optional line/col info
    const lineMatch = msg.match(/:(\d+):(\d+):/);
    throw new TranspileError(
      msg,
      filePath,
      lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      lineMatch ? parseInt(lineMatch[2], 10) : undefined,
    );
  }
}

/**
 * Transpile all files that need transpilation in a file map.
 * Returns a new Map with transpiled content replacing the originals.
 */
export async function transpileAll(
  files: Map<string, string>,
  framework: Framework = 'none',
  esbuildWasmURL?: string,
): Promise<Map<string, string>> {
  const result = new Map(files);
  const toTranspile: Array<[string, string]> = [];

  for (const [path, content] of files) {
    if (needsTranspilation(path)) {
      toTranspile.push([path, content]);
    }
  }

  if (toTranspile.length === 0) return result;

  // Ensure esbuild is ready before starting parallel transforms
  await ensureEsbuild(esbuildWasmURL);

  // Transform all files in parallel
  const jobs = toTranspile.map(async ([path, content]) => {
    const transpiled = await transpileFile({
      filePath: path,
      source: content,
      framework,
      esbuildWasmURL,
    });
    return [path, transpiled.code] as const;
  });

  const results = await Promise.all(jobs);
  for (const [path, code] of results) {
    result.set(path, code);
  }

  return result;
}

// ─── Helpers ───────────────────────────────────────────────────

type Loader = 'tsx' | 'ts' | 'jsx' | 'js';

function loaderFor(filePath: string): Loader {
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.ts')) return 'ts';
  if (filePath.endsWith('.jsx')) return 'jsx';
  return 'js';
}

function jsxConfigFor(
  framework: Framework,
  loader: Loader,
): Record<string, unknown> {
  // Only apply JSX config when the file may contain JSX
  if (loader !== 'tsx' && loader !== 'jsx') {
    return {};
  }

  switch (framework) {
    case 'react':
      return { jsx: 'automatic', jsxImportSource: 'react' };
    case 'preact':
      return { jsx: 'automatic', jsxImportSource: 'preact' };
    case 'solid':
      // Solid requires Babel plugin — esbuild can't do fine-grained reactivity.
      // Preserve JSX for now; in v2 we could pipe through Babel.
      return { jsx: 'automatic', jsxImportSource: 'react' };
    default:
      // Unknown framework — default to React-style automatic transform
      return { jsx: 'automatic', jsxImportSource: 'react' };
  }
}

/** Does this file path need to run through the transpiler? */
export function needsTranspilation(path: string): boolean {
  return /\.(tsx?|jsx)$/.test(path);
}

/**
 * Returns the `process.env` shim that should be prepended to the
 * entry point of projects that may reference `process.env.NODE_ENV`.
 */
export function processEnvShim(): string {
  return `if(typeof globalThis.process==='undefined'){globalThis.process={env:{NODE_ENV:'production'}};}`;
}

/**
 * Returns an `import.meta.env` shim for Vite projects.
 * Provides the standard Vite env variables so that code referencing
 * `import.meta.env.MODE`, `import.meta.env.PROD`, etc. works at runtime.
 */
export function importMetaEnvShim(): string {
  return [
    `if(!import.meta.env){`,
    `Object.defineProperty(import.meta,'env',{value:{`,
    `MODE:'production',`,
    `BASE_URL:'/',`,
    `PROD:true,`,
    `DEV:false,`,
    `SSR:false`,
    `}});`,
    `}`,
  ].join('');
}
