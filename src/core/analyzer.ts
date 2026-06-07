import type {
  ProjectConfig,
  ProjectType,
  Framework,
  ResolvedProject,
} from '../types';
import { EntryPointError } from '../errors';

// ─── Constants ─────────────────────────────────────────────────

/** HTML entry points checked in order of priority. */
const HTML_ENTRY_CANDIDATES = [
  'index.html',
  'public/index.html',
  'src/index.html',
];

/** JS/TS entry points checked in order of priority (for shell generation). */
const JS_ENTRY_CANDIDATES = [
  'src/main.jsx',
  'src/main.tsx',
  'src/main.js',
  'src/main.ts',
  'src/index.jsx',
  'src/index.tsx',
  'src/index.js',
  'src/index.ts',
  'src/App.jsx',
  'src/App.tsx',
  'src/App.js',
  'src/App.ts',
  'index.js',
  'index.ts',
  'index.jsx',
  'index.tsx',
];

/** Regex to detect bare (non-relative, non-URL) import specifiers. */
const BARE_IMPORT_RE = /(?:^|\n)\s*import\s+[\s\S]*?from\s*['"]([^./'"][^'"]*)['"]/;

/** Node built-in modules (top-level names). */
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram',
  'dns', 'events', 'fs', 'http', 'http2', 'https', 'net', 'os',
  'path', 'perf_hooks', 'process', 'querystring', 'readline',
  'stream', 'string_decoder', 'tls', 'tty', 'url', 'util', 'v8',
  'vm', 'worker_threads', 'zlib',
]);

// ─── Analyzer ──────────────────────────────────────────────────

/**
 * Analyse a resolved project and determine its type, entry point,
 * framework, and other metadata.
 *
 * If `overrideType` or `overrideEntry` are provided they take
 * priority over automatic detection.
 */
export function analyzeProject(
  project: ResolvedProject,
  overrideType?: ProjectType,
  overrideEntry?: string,
): ProjectConfig {
  const { files } = project;

  // ─── Parse package.json (if present) ─────────────────────
  let dependencies: Record<string, string> = {};
  let devDependencies: Record<string, string> = {};
  const pkgRaw = files.get('package.json');

  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw);
      dependencies = pkg.dependencies ?? {};
      devDependencies = pkg.devDependencies ?? {};
    } catch {
      // malformed package.json — continue with empty deps
    }
  }

  const allDeps = { ...devDependencies, ...dependencies };

  // ─── Detect framework ────────────────────────────────────
  let framework: Framework = 'none';
  if ('react' in dependencies || 'react-dom' in dependencies) {
    framework = 'react';
  } else if ('preact' in dependencies) {
    framework = 'preact';
  } else if ('solid-js' in dependencies) {
    framework = 'solid';
  }

  // ─── Detect JSX / TypeScript presence ────────────────────
  const paths = Array.from(files.keys());
  const hasJSX = paths.some((p) => p.endsWith('.jsx') || p.endsWith('.tsx'));
  const hasTypeScript =
    paths.some((p) => p.endsWith('.ts') || p.endsWith('.tsx')) ||
    'typescript' in allDeps;

  // ─── Detect Vite ─────────────────────────────────────────
  const hasViteConfig = paths.some((p) =>
    /^vite\.config\.(js|ts|mjs|mts)$/.test(p),
  );
  const hasViteDep = 'vite' in allDeps;
  const isVite = hasViteConfig || hasViteDep;

  // ─── Find HTML entry point ───────────────────────────────
  let htmlEntry: string | null = overrideEntry ?? null;

  if (!htmlEntry) {
    for (const candidate of HTML_ENTRY_CANDIDATES) {
      if (files.has(candidate)) {
        htmlEntry = candidate;
        break;
      }
    }
  }

  // If no standard candidate, look for any lone .html file at root
  if (!htmlEntry) {
    const rootHtmlFiles = paths.filter(
      (p) => !p.includes('/') && p.endsWith('.html'),
    );
    if (rootHtmlFiles.length === 1) {
      htmlEntry = rootHtmlFiles[0];
    }
  }

  // ─── Find JS entry point (for shell generation) ──────────
  let jsEntry: string | undefined;
  for (const candidate of JS_ENTRY_CANDIDATES) {
    if (files.has(candidate)) {
      jsEntry = candidate;
      break;
    }
  }

  // If we have an HTML entry, try extracting the <script src> from it
  if (htmlEntry && !jsEntry) {
    const htmlContent = files.get(htmlEntry);
    if (htmlContent) {
      const scriptMatch = htmlContent.match(
        /<script[^>]+src=["']([^"']+)["']/,
      );
      if (scriptMatch) {
        let src = scriptMatch[1];
        // Vite uses root-relative paths like /src/main.tsx — strip leading /
        if (src.startsWith('/')) {
          src = src.slice(1);
        }
        jsEntry = src;
      }
    }
  }

  // No entry point at all → error
  if (!htmlEntry && !jsEntry) {
    throw new EntryPointError();
  }

  // If no HTML entry but we have a JS entry, we'll generate a shell
  // Use a synthetic path that the assembler will recognise
  if (!htmlEntry) {
    htmlEntry = '__generated__/index.html';
  }

  // ─── Classify project type ───────────────────────────────
  let type: ProjectType = overrideType ?? detectProjectType({
    hasPkg: !!pkgRaw,
    hasJSX,
    hasTypeScript,
    hasBareImports: hasBareImports(files),
    isVite,
  });

  // ─── Detect Tailwind CSS usage ───────────────────────────
  const usesTailwind = usesTailwindCSS(files);

  return {
    type,
    entryPoint: htmlEntry,
    dependencies,
    framework,
    hasJSX,
    hasTypeScript,
    jsEntryPoint: jsEntry,
    isVite,
    usesTailwind,
  };
}

// ─── Helpers ───────────────────────────────────────────────────

interface DetectInput {
  hasPkg: boolean;
  hasJSX: boolean;
  hasTypeScript: boolean;
  hasBareImports: boolean;
  isVite: boolean;
}

function detectProjectType(input: DetectInput): ProjectType {
  const { hasPkg, hasJSX, hasTypeScript, hasBareImports, isVite } = input;

  // Vite projects are always treated as 'vite' type regardless of JSX/TS
  if (isVite) return 'vite';

  if (hasJSX && hasTypeScript) return 'jsx-typescript';
  if (hasJSX) return 'jsx';
  if (hasTypeScript) return 'typescript';
  if (hasPkg || hasBareImports) return 'static-esm';
  return 'static';
}

/**
 * Scan all JS/TS files for bare import specifiers
 * (not starting with `.` or `/` or `http`).
 */
function hasBareImports(files: Map<string, string>): boolean {
  for (const [path, content] of files) {
    if (/\.(js|ts|jsx|tsx|mjs)$/.test(path)) {
      if (BARE_IMPORT_RE.test(content)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Detect whether a project relies on Tailwind CSS — either because a CSS file
 * uses Tailwind directives (`@tailwind` / `@apply`) or because a
 * `tailwind.config.*` file is present.
 */
export function usesTailwindCSS(files: Map<string, string>): boolean {
  for (const [path, content] of files) {
    if (/(?:^|\/)tailwind\.config\.(?:js|cjs|mjs|ts)$/.test(path)) {
      return true;
    }
    if (path.endsWith('.css') && /@tailwind\b|@apply\b/.test(content)) {
      return true;
    }
  }
  return false;
}

export { NODE_BUILTINS };
