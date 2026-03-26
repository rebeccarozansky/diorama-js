import type { DioramaError } from './errors';

// ─── Resolved project from GitHub ──────────────────────────────

/** A fully resolved project fetched from GitHub. */
export interface ResolvedProject {
  owner: string;
  repo: string;
  branch: string;
  /** Git tree SHA — used as cache key. */
  sha: string;
  /** Relative path → text file content. */
  files: Map<string, string>;
  /** Relative path → binary blob (images, fonts, etc.). */
  binaryFiles: Map<string, Blob>;
}

// ─── Project analysis ──────────────────────────────────────────

export type ProjectType =
  | 'static'
  | 'static-esm'
  | 'jsx'
  | 'typescript'
  | 'jsx-typescript'
  | 'vite';

export type Framework = 'react' | 'preact' | 'solid' | 'none';

/** Result of project type detection / analysis. */
export interface ProjectConfig {
  type: ProjectType;
  /** Path to the main HTML file (may be generated). */
  entryPoint: string;
  /** npm dependencies from package.json (name → semver). */
  dependencies: Record<string, string>;
  framework: Framework;
  hasJSX: boolean;
  hasTypeScript: boolean;
  /** JS entry point for generated HTML shells (e.g. `src/index.tsx`). */
  jsEntryPoint?: string;
  /** Whether the project uses Vite as its build tool. */
  isVite: boolean;
}

// ─── CDN provider ──────────────────────────────────────────────

export type CDNProviderName = 'esm.sh' | 'skypack' | 'unpkg';

export interface CDNProvider {
  buildURL(packageName: string, version?: string, subpath?: string): string;
}

// ─── Cache ─────────────────────────────────────────────────────

export type CacheStrategy = 'normal' | 'aggressive';

// ─── Loading strategy ──────────────────────────────────────────

export type LoadingStrategy = 'eager' | 'click' | 'viewport';

// ─── Frame styles ──────────────────────────────────────────────

/**
 * Built-in decorative frame styles that wrap the rendered iframe.
 *
 * - `'none'`      — No frame (default).
 * - `'standard'`  — Clean, minimal border with subtle shadow.
 * - `'polaroid'`  — Polaroid-photo style with thick white bottom.
 * - `'museum'`    — Ornate golden frame like a fine-art gallery.
 * - `'terminal'`  — Dark terminal / code-editor chrome.
 * - `'postcard'`  — Vintage postcard with stamp and postmark.
 * - `'blueprint'` — Technical blueprint with grid overlay border.
 * - `'browser'`   — Browser window chrome with address bar.
 */
export type FrameStyle =
  | 'none'
  | 'standard'
  | 'polaroid'
  | 'museum'
  | 'terminal'
  | 'postcard'
  | 'blueprint'
  | 'browser';

// ─── Constructor options (global) ──────────────────────────────

export interface DioramaOptions {
  /** Enable localStorage caching. Default: `true`. */
  cache?: boolean;
  /** Cache time-to-live in seconds. Default: `3600` (1 hour). */
  cacheTTL?: number;
  /** Cache strategy. `'aggressive'` also caches the tree SHA. Default: `'normal'`. */
  cacheStrategy?: CacheStrategy;
  /** CDN used to resolve bare npm imports. Default: `'esm.sh'`. */
  cdnProvider?: CDNProviderName;
  /** Optional GitHub personal-access token (increases rate limit to 5 000/h). */
  githubToken?: string;
  /** URL to the esbuild-wasm binary. `'auto'` loads from esm.sh. */
  esbuildWasmURL?: string | 'auto';
  /** Maximum parallel file fetches. Default: `6`. */
  maxConcurrentFetches?: number;
  /** Total render timeout in milliseconds. Default: `30000`. */
  timeout?: number;
}

// ─── Per-render options ────────────────────────────────────────

export interface RenderOptions {
  /** Override the branch to render. */
  branch?: string;
  /** Render a subdirectory within the repo. */
  subdirectory?: string;
  /** When to create and populate the iframe. Default: `'eager'`. */
  loading?: LoadingStrategy;
  /** Image URL shown as a placeholder for `click` / `viewport` loading. */
  placeholder?: string;
  /** CSS height of the iframe. Default: `'500px'`. */
  height?: string;
  /** Decorative frame style wrapping the iframe. Default: `'none'`. */
  frame?: FrameStyle;
  /** Allow click-to-expand the preview to fill the viewport. Default: `false`. */
  expand?: boolean;
  /** Iframe sandbox flags. Default: `['allow-scripts']`. */
  sandbox?: string[];
  /** Override automatic project type detection. */
  projectType?: ProjectType;
  /** Override entry point detection. */
  entryPoint?: string;
  /** Glob patterns of files to include. */
  include?: string[];
  /** Glob patterns of files to exclude. */
  exclude?: string[];
  /** Called when rendering completes successfully. */
  onLoad?: () => void;
  /** Called when an error occurs at any pipeline stage. */
  onError?: (error: DioramaError) => void;
}

// ─── Diorama render instance ───────────────────────────────────

export interface DioramaInstance {
  /** Re-fetch the project and re-render. */
  reload(): Promise<void>;
  /** Remove the iframe, revoke Blob URLs, clean up observers. */
  destroy(): void;
}
