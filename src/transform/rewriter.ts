import type { CDNProvider, CDNProviderName } from '../types';
import { NodeBuiltinError } from '../errors';
import { NODE_BUILTINS } from '../core/analyzer';

// ─── CDN Providers ─────────────────────────────────────────────

const esmShProvider: CDNProvider = {
  buildURL(name, version, subpath) {
    const ver = version ? `@${version}` : '';
    const sub = subpath ? `/${subpath}` : '';
    return `https://esm.sh/${name}${ver}${sub}`;
  },
};

const skypackProvider: CDNProvider = {
  buildURL(name, version, subpath) {
    const ver = version ? `@${version}` : '';
    const sub = subpath ? `/${subpath}` : '';
    return `https://cdn.skypack.dev/${name}${ver}${sub}`;
  },
};

const unpkgProvider: CDNProvider = {
  buildURL(name, version, subpath) {
    const ver = version ? `@${version}` : '';
    const sub = subpath ? `/${subpath}` : '';
    return `https://unpkg.com/${name}${ver}${sub}?module`;
  },
};

export function getCDNProvider(name: CDNProviderName): CDNProvider {
  switch (name) {
    case 'skypack': return skypackProvider;
    case 'unpkg':   return unpkgProvider;
    case 'esm.sh':
    default:        return esmShProvider;
  }
}

/**
 * Build a raw stylesheet URL for a bare/package CSS specifier such as
 * `leaflet/dist/leaflet.css`.
 *
 * Unlike {@link rewriteImports}, the resulting URL is served as real CSS
 * (`text/css`) instead of a JS module, so it can be used directly in a
 * `<link rel="stylesheet">` or a CSS `@import`. The version is pinned from
 * the project's dependencies (when available) so the stylesheet stays
 * consistent with the JS imports of the same package.
 *
 * `esm.sh` and `unpkg` both serve package CSS at the file path; `skypack`
 * does not reliably serve raw CSS, so it falls back to `esm.sh`.
 */
export function buildCSSURL(
  specifier: string,
  options: { dependencies?: Record<string, string>; cdnProvider?: CDNProviderName } = {},
): string {
  const { dependencies = {}, cdnProvider = 'esm.sh' } = options;
  // Drop any ?query / #hash suffix before resolving the package + subpath.
  const clean = specifier.replace(/[?#].*$/, '');
  const { packageName, subpath } = parseSpecifier(clean);
  const version = dependencies[packageName];
  const ver = version ? `@${version}` : '';
  const sub = subpath ? `/${subpath}` : '';

  if (cdnProvider === 'unpkg') {
    // No `?module` here — that would make unpkg return JS instead of CSS.
    return `https://unpkg.com/${packageName}${ver}${sub}`;
  }
  return `https://esm.sh/${packageName}${ver}${sub}`;
}

// ─── Import rewriting ──────────────────────────────────────────

/** Options for import rewriting. */
export interface RewriteOptions {
  /** Package name → version from package.json. */
  dependencies?: Record<string, string>;
  /** CDN provider to use. Default: `'esm.sh'`. */
  cdnProvider?: CDNProviderName;
  /** Framework for esm.sh-specific `?deps` hints. */
  framework?: 'react' | 'preact' | 'solid' | 'none';
  /** React version (for `?deps` hint). */
  reactVersion?: string;
  /** Whether the project uses Vite (enables import.meta.env rewriting). */
  isVite?: boolean;
}

/**
 * Rewrite bare npm imports in source code to CDN URLs.
 *
 * **What gets rewritten:**
 * - `import x from 'pkg'`
 * - `import { x } from 'pkg/sub'`
 * - `import * as x from 'pkg'`
 * - `export { x } from 'pkg'`
 * - `export * from 'pkg'`
 * - `import('pkg')`
 *
 * **What is left alone:**
 * - Relative: `'./foo'`, `'../bar'`
 * - Absolute URLs: `'https://...'`
 */
export function rewriteImports(
  source: string,
  options: RewriteOptions = {},
): string {
  const {
    dependencies = {},
    cdnProvider = 'esm.sh',
    framework = 'none',
    reactVersion,
    isVite = false,
  } = options;

  const provider = getCDNProvider(cdnProvider);

  function rewriteSpecifier(raw: string): string {
    // Skip relative and absolute-URL specifiers
    if (raw.startsWith('.') || raw.startsWith('/') || /^https?:\/\//.test(raw)) {
      return raw;
    }

    // Skip CSS specifiers (including `pkg/dist/x.css?query`). CSS is handled
    // by the assembler's CSS extractor — inlined as a <style> (local) or
    // loaded via <link rel="stylesheet"> (package). Rewriting it to a
    // JS-module URL makes the browser load CSS as a script, which fails with
    // a "text/css MIME type" error and breaks the whole module graph.
    if (/\.css(?:[?#]|$)/.test(raw)) {
      return raw;
    }

    // Parse scoped and deep imports
    const { packageName, subpath } = parseSpecifier(raw);

    // Node built-in check
    if (NODE_BUILTINS.has(packageName) || NODE_BUILTINS.has(packageName.replace('node:', ''))) {
      throw new NodeBuiltinError(packageName);
    }

    const version = dependencies[packageName];
    let url = provider.buildURL(packageName, version, subpath);

    // esm.sh-specific hints for React ecosystem
    if (cdnProvider === 'esm.sh' && reactVersion && (framework === 'react')) {
      // Append ?deps hint so all packages use the same React version
      if (packageName !== 'react' && packageName !== 'react-dom') {
        const sep = url.includes('?') ? '&' : '?';
        url += `${sep}deps=react@${reactVersion},react-dom@${reactVersion}`;
      }
    }

    return url;
  }

  let result = source;

  // Static imports:  import ... from 'specifier'
  result = result.replace(
    /(import\s+(?:[\s\S]*?)\s+from\s*['"])([^'"]+)(['"])/g,
    (_match, pre: string, specifier: string, post: string) => {
      return `${pre}${rewriteSpecifier(specifier)}${post}`;
    },
  );

  // Side-effect imports:  import 'specifier'
  // (Only rewrites imports NOT preceded by `from`, which are already handled)
  result = result.replace(
    /(?<!\bfrom\s*)(import\s*['"])([^'"]+)(['"])/g,
    (_m, pre: string, specifier: string, post: string) => {
      return `${pre}${rewriteSpecifier(specifier)}${post}`;
    },
  );

  // Dynamic imports:  import('specifier')
  result = result.replace(
    /(import\s*\(\s*['"])([^'"]+)(['"]\s*\))/g,
    (_match, pre: string, specifier: string, post: string) => {
      return `${pre}${rewriteSpecifier(specifier)}${post}`;
    },
  );

  // Re-exports:  export { ... } from 'specifier'  /  export * from 'specifier'
  result = result.replace(
    /(export\s+(?:\{[^}]*\}|\*)\s+from\s*['"])([^'"]+)(['"])/g,
    (_match, pre: string, specifier: string, post: string) => {
      return `${pre}${rewriteSpecifier(specifier)}${post}`;
    },
  );

  // Vite import.meta.env inline replacements
  if (isVite) {
    result = result.replace(/\bimport\.meta\.env\.MODE\b/g, '"production"');
    result = result.replace(/\bimport\.meta\.env\.BASE_URL\b/g, '"/"');
    result = result.replace(/\bimport\.meta\.env\.PROD\b/g, 'true');
    result = result.replace(/\bimport\.meta\.env\.DEV\b/g, 'false');
    result = result.replace(/\bimport\.meta\.env\.SSR\b/g, 'false');
    // Replace any remaining VITE_* env vars with empty string
    result = result.replace(/\bimport\.meta\.env\.VITE_\w+\b/g, '""');
  }

  return result;
}

// ─── Helpers ───────────────────────────────────────────────────

interface ParsedSpecifier {
  packageName: string;
  subpath?: string;
}

/**
 * Parse a bare specifier into package name + optional subpath.
 * Handles scoped packages (`@scope/name/sub`).
 */
function parseSpecifier(raw: string): ParsedSpecifier {
  if (raw.startsWith('@')) {
    // Scoped: @scope/name or @scope/name/sub/path
    const parts = raw.split('/');
    const packageName = `${parts[0]}/${parts[1]}`;
    const subpath = parts.length > 2 ? parts.slice(2).join('/') : undefined;
    return { packageName, subpath };
  }

  const slashIndex = raw.indexOf('/');
  if (slashIndex === -1) {
    return { packageName: raw };
  }

  return {
    packageName: raw.slice(0, slashIndex),
    subpath: raw.slice(slashIndex + 1),
  };
}
