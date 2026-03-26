import type { ProjectConfig, ResolvedProject } from '../types';
import { AssemblyError } from '../errors';
import { processEnvShim } from './transpiler';

// ─── Constants ─────────────────────────────────────────────────

const SMALL_ASSET_LIMIT = 100_000; // 100 KB

/** Extensions that can be base64-inlined. */
const INLINEABLE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
]);

/**
 * Prefix used for import-map keys.
 *
 * We use bare-specifier keys (`__diorama__/src/main.ts`) instead of
 * relative paths (`./src/main.ts`) so that imports between blob-URL
 * modules still resolve through the import map.  Relative specifiers
 * inside a blob are resolved against the blob's opaque URL, which
 * never matches the page-relative import-map keys.  Bare specifiers
 * are always looked up in the import map regardless of referrer.
 */
const IMPORT_MAP_PREFIX = '__diorama__/';

/** Asset extensions that Vite supports as imports (import x from './img.png'). */
const ASSET_IMPORT_EXTENSIONS: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
};

// ─── Public API ────────────────────────────────────────────────

export interface AssembleOptions {
  project: ResolvedProject;
  config: ProjectConfig;
  /**
   * The file map to use — may contain already-transpiled / rewritten content.
   * Falls back to `project.files` if not provided.
   */
  transformedFiles?: Map<string, string>;
}

export interface AssembleResult {
  /** The fully assembled HTML string. */
  html: string;
  /** Whether the HTML uses import maps / Blob URL references. */
  usesESM: boolean;
}

/**
 * Build the final HTML document to be injected into the sandbox.
 */
export function assembleHTML(options: AssembleOptions): AssembleResult {
  const { project, config, transformedFiles } = options;
  const files = transformedFiles ?? project.files;

  switch (config.type) {
    case 'static':
      return assembleStatic(files, project, config);
    case 'static-esm':
    case 'jsx':
    case 'typescript':
    case 'jsx-typescript':
    case 'vite':
      return assembleESM(files, project, config);
    default:
      throw new AssemblyError(`Unsupported project type: ${config.type}`);
  }
}

// ─── Static assembly (Tier 1) ──────────────────────────────────

function assembleStatic(
  files: Map<string, string>,
  project: ResolvedProject,
  config: ProjectConfig,
): AssembleResult {
  let html = files.get(config.entryPoint);
  if (!html) {
    throw new AssemblyError(
      `Entry point "${config.entryPoint}" not found in the project files.`,
    );
  }

  // Inline local CSS (<link rel="stylesheet" href="...">)
  html = inlineLocalCSS(html, files, config.entryPoint);

  // Inline local JS (<script src="...">)
  html = inlineLocalJS(html, files, config.entryPoint);

  // Rewrite local asset paths to data URLs
  html = inlineAssets(html, project, config.entryPoint);

  return { html, usesESM: false };
}

// ─── ESM assembly (Tier 2 & 3) ────────────────────────────────

function assembleESM(
  files: Map<string, string>,
  project: ResolvedProject,
  config: ProjectConfig,
): AssembleResult {
  const isGenerated = config.entryPoint === '__generated__/index.html';

  // ── Pre-process JS files before touching HTML ────────────
  // Rewrite asset imports (import logo from './assets/logo.svg') → inline data URLs
  rewriteAssetImports(files, project);

  // Collect all CSS imports from JS/TS files and inject as <style>
  const cssFromJS = extractCSSImports(files);

  // Inject import.meta.env shim into each JS module for Vite projects.
  // This must happen per-module because `import.meta` is scoped to
  // each module — a global `<script>` shim can't set it (and would
  // cause a SyntaxError since `import.meta` is only valid in modules).
  if (config.isVite) {
    injectImportMetaEnv(files);
  }

  // Build import map for relative imports between project files.
  // This must happen after asset/CSS rewrites so the blob URLs contain
  // the final code.
  const importMap = buildImportMap(files, config);

  // ── Build the HTML document ──────────────────────────────
  let html: string;

  if (isGenerated) {
    html = generateHTMLShell(files, config);
  } else {
    html = files.get(config.entryPoint) ?? '';
    if (!html) {
      throw new AssemblyError(
        `Entry point "${config.entryPoint}" not found in the project files.`,
      );
    }
    // Inline local CSS links
    html = inlineLocalCSS(html, files, config.entryPoint);
    // Replace <script src="..."> with import-map-aware module loaders
    html = rewriteScriptSrcsToImportMap(html, config.entryPoint);
    // Inline local assets
    html = inlineAssets(html, project, config.entryPoint);
  }

  // Inject collected CSS from JS imports
  if (cssFromJS) {
    html = injectIntoHead(html, `<style>\n${cssFromJS}\n</style>`);
  }

  // Inject import map
  if (Object.keys(importMap).length > 0) {
    const importMapJSON = JSON.stringify({ imports: importMap }, null, 2);
    html = injectIntoHead(
      html,
      `<script type="importmap">\n${importMapJSON}\n</script>`,
    );
  }

  // Inject process.env shim if this is a framework project
  if (config.framework !== 'none' || config.hasTypeScript || config.hasJSX) {
    html = injectIntoHead(
      html,
      `<script>${processEnvShim()}</script>`,
    );
  }

  // Inject process.env shim for Vite projects if not already done
  if (config.isVite) {
    if (config.framework === 'none' && !config.hasTypeScript && !config.hasJSX) {
      html = injectIntoHead(
        html,
        `<script>${processEnvShim()}</script>`,
      );
    }
  }

  return { html, usesESM: true };
}

// ─── HTML shell generation ─────────────────────────────────────

function generateHTMLShell(
  files: Map<string, string>,
  config: ProjectConfig,
): string {
  const jsEntry = config.jsEntryPoint;

  let mountScript = '';

  if (config.framework === 'react' && jsEntry) {
    // Generate React mount code — use bare specifier prefix so the
    // import map resolves correctly from the blob URL page.
    mountScript = `
import { createRoot } from 'react-dom/client';
import App from '${IMPORT_MAP_PREFIX}${jsEntry}';
const root = createRoot(document.getElementById('root'));
root.render(typeof App === 'function' ? App() : App);`;
  } else if (config.framework === 'preact' && jsEntry) {
    mountScript = `
import { render } from 'preact';
import App from '${IMPORT_MAP_PREFIX}${jsEntry}';
render(typeof App === 'function' ? App() : App, document.getElementById('root'));`;
  } else if (jsEntry) {
    mountScript = `import '${IMPORT_MAP_PREFIX}${jsEntry}';`;
  }

  // Collect any global CSS files
  const cssFiles: string[] = [];
  for (const [path, content] of files) {
    if (path.endsWith('.css') && !path.includes('module.css')) {
      cssFiles.push(content);
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>* { margin: 0; box-sizing: border-box; }</style>
${cssFiles.map((css) => `  <style>\n${css}\n  </style>`).join('\n')}
</head>
<body>
  <div id="root"></div>
  <script type="module">${mountScript}
  </script>
</body>
</html>`;
}

// ─── Import map builder ────────────────────────────────────────

/**
 * Build a mapping of project file paths → blob URLs.
 *
 * Rather than using a browser import map (which doesn't help for
 * inter-module imports within blob URLs), we rewrite every
 * relative import between project files to point directly at the
 * blob URL of the target file. This requires two passes:
 *
 *  1. Collect all JS/TS file paths and their full `./dir/file` keys.
 *  2. For each file, rewrite relative `import … from './sibling'`
 *     to reference the other file's blob URL, then create the blob.
 */
function buildImportMap(
  files: Map<string, string>,
  _config: ProjectConfig,
): Record<string, string> {
  // 1) Build a lookup: absolute project path → content
  const jsFiles = new Map<string, string>();
  for (const [path, content] of files) {
    if (/\.(js|ts|jsx|tsx|mjs)$/.test(path)) {
      jsFiles.set(path, content);
    }
  }

  // 2) First pass — create all blob URLs with *rewritten* relative imports.
  //    We resolve all relative imports between project files by
  //    rewriting them to blob URLs. Because each file may depend on
  //    another, we pre-compute the blob URL for each file once we've
  //    rewritten its content.

  // Pre-compute the target blob URL for each file.
  // We'll do this in one pass: for each file, scan its imports,
  // resolve targets, and replace with blob URLs built on the fly.
  // To avoid circular dependency issues, we use a two-pass approach:
  //   Pass 1: create blob URLs without rewriting (just content as-is)
  //   Pass 2: for the entry point (inlined), we don't need rewrites
  //           because it's inlined directly.
  //
  // Actually the simplest correct approach: create blob URLs for each
  // file after rewriting its relative imports to full `./path` form,
  // then let the import map handle `./path` → blob URL resolution.

  const map: Record<string, string> = {};

  for (const [path, content] of jsFiles) {
    // Rewrite relative imports within this file to use bare specifiers
    // (e.g. `import './counter.ts'` → `import '__diorama__/src/counter.ts'`)
    // so they resolve through the import map even from blob URL modules.
    const dir = directoryOf(path);
    const rewritten = rewriteRelativeImportsToBareSpecifiers(content, dir, jsFiles);
    const blobURL = createBlobURL(rewritten, 'application/javascript');
    map[`${IMPORT_MAP_PREFIX}${path}`] = blobURL;
  }

  return map;
}

/**
 * Rewrite relative import specifiers in `source` so that they use
 * bare-specifier keys prefixed with `__diorama__/`.
 *
 * For example, if `dir` is `src` and the code has `import './counter.ts'`,
 * this rewrites it to `import '__diorama__/src/counter.ts'`.  Bare
 * specifiers are always resolved through the import map, even when the
 * importing module is loaded from a blob URL (where relative paths
 * would resolve against the opaque blob origin instead).
 */
function rewriteRelativeImportsToBareSpecifiers(
  source: string,
  dir: string,
  allFiles: Map<string, string>,
): string {
  // Match import/export specifiers that are relative
  return source.replace(
    /((?:import|export)\s+(?:[\s\S]*?\s+from\s*|)['"])(\.[^'"]+)(['"])/g,
    (_match, pre: string, specifier: string, post: string) => {
      // Resolve the specifier relative to the file's directory
      const resolved = dir
        ? resolvePath(dir, specifier)
        : specifier.replace(/^\.\//,  '');

      // Only rewrite if the resolved path exists in the project
      if (allFiles.has(resolved)) {
        return `${pre}${IMPORT_MAP_PREFIX}${resolved}${post}`;
      }
      // Try common extension fallbacks (.ts → .js, etc.)
      const withoutExt = resolved.replace(/\.[^.]+$/, '');
      for (const ext of ['.js', '.ts', '.jsx', '.tsx', '.mjs']) {
        if (allFiles.has(withoutExt + ext)) {
          return `${pre}${IMPORT_MAP_PREFIX}${withoutExt + ext}${post}`;
        }
      }
      return _match; // leave as-is if not a project file
    },
  );
}

function createBlobURL(content: string, mime: string): string {
  // Always use data URIs instead of blob URLs.
  //
  // The import-map entries are embedded in an HTML page that is itself
  // loaded via blob URL inside a sandboxed iframe (sandbox="allow-scripts").
  // Without `allow-same-origin` the iframe has an opaque (`null`) origin,
  // so blob URLs created by the parent page are cross-origin and silently
  // fail to load as ES modules.  Data URIs are self-contained and have
  // no origin restrictions, so they work universally.
  return `data:${mime};base64,${btoa(unescape(encodeURIComponent(content)))}`;
}

// ─── CSS inlining ──────────────────────────────────────────────

function inlineLocalCSS(
  html: string,
  files: Map<string, string>,
  htmlPath: string,
): string {
  const dir = directoryOf(htmlPath);

  return html.replace(
    /<link\s+[^>]*(?:rel=["']stylesheet["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*rel=["']stylesheet["'])[^>]*\/?>/gi,
    (match, href1: string | undefined, href2: string | undefined) => {
      const href = href1 ?? href2;
      if (!href) return match;
      // Skip external URLs
      if (/^https?:\/\//.test(href)) return match;

      // Handle root-relative paths (Vite convention)
      let resolved: string;
      if (href.startsWith('/')) {
        resolved = href.slice(1);
      } else {
        resolved = resolvePath(dir, href);
      }

      const css = files.get(resolved);
      if (css) {
        return `<style>\n${css}\n</style>`;
      }
      return match; // leave as-is if file not found
    },
  );
}

// ─── JS inlining ──────────────────────────────────────────────

function inlineLocalJS(
  html: string,
  files: Map<string, string>,
  htmlPath: string,
): string {
  const dir = directoryOf(htmlPath);

  return html.replace(
    /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
    (match, src: string) => {
      // Skip external URLs
      if (/^https?:\/\//.test(src)) return match;

      // Handle root-relative paths (Vite convention: /src/main.tsx)
      let resolved: string;
      if (src.startsWith('/')) {
        resolved = src.slice(1);
      } else {
        resolved = resolvePath(dir, src);
      }

      const js = files.get(resolved);
      if (js) {
        // Preserve type="module" if present
        const typeMatch = match.match(/type=["']([^"']+)["']/);
        const typeAttr = typeMatch ? ` type="${typeMatch[1]}"` : '';
        return `<script${typeAttr}>\n${js}\n</script>`;
      }
      return match;
    },
  );
}

// ─── Script src → import map redirect ─────────────────────────

/**
 * Replace `<script type="module" src="/src/main.ts"></script>` with
 * `<script type="module">import './src/main.ts';</script>` so that the
 * browser's import map resolves the entry point to its blob URL.
 *
 * This avoids inlining the script content directly (which would break
 * relative imports between project files, since inlined scripts resolve
 * imports relative to the page URL, not the original file location).
 */
function rewriteScriptSrcsToImportMap(
  html: string,
  htmlPath: string,
): string {
  const dir = directoryOf(htmlPath);

  return html.replace(
    /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
    (match, src: string) => {
      // Skip external URLs
      if (/^https?:\/\//.test(src)) return match;

      // Resolve to project-root-relative path
      let resolved: string;
      if (src.startsWith('/')) {
        resolved = src.slice(1);
      } else {
        resolved = resolvePath(dir, src);
      }

      // Emit an inline import using the bare-specifier prefix so the
      // import map can resolve it (relative paths don't work from blob URLs).
      return `<script type="module">import '${IMPORT_MAP_PREFIX}${resolved}';</script>`;
    },
  );
}

// ─── Asset inlining ───────────────────────────────────────────

function inlineAssets(
  html: string,
  project: ResolvedProject,
  htmlPath: string,
): string {
  const dir = directoryOf(htmlPath);

  // Rewrite src="..." and href="..." that point to local binary files
  return html.replace(
    /(src|href)=["']([^"']+)["']/gi,
    (match, attr: string, ref: string) => {
      if (/^(https?:\/\/|data:|blob:|#)/.test(ref)) return match;

      // Handle root-relative paths (Vite convention)
      let resolved: string;
      if (ref.startsWith('/')) {
        resolved = ref.slice(1);
      } else {
        resolved = resolvePath(dir, ref);
      }
      const ext = extensionOf(resolved);

      if (!INLINEABLE_EXTENSIONS.has(ext)) return match;

      // Check binary files first
      const blob = project.binaryFiles.get(resolved);
      if (blob && blob.size <= SMALL_ASSET_LIMIT) {
        // We can't synchronously read the blob, so for SVGs in text files
        // use the text content directly
        if (ext === '.svg') {
          const svgText = project.files.get(resolved);
          if (svgText) {
            const encoded = `data:image/svg+xml;base64,${btoa(svgText)}`;
            return `${attr}="${encoded}"`;
          }
        }
        // For other binary files, we'd need async — skip for now
        return match;
      }

      // Check if SVG is in text files
      if (ext === '.svg') {
        const svgText = project.files.get(resolved);
        if (svgText) {
          const encoded = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`;
          return `${attr}="${encoded}"`;
        }
      }

      return match;
    },
  );
}

// ─── Asset import rewriting ────────────────────────────────────

/**
 * Rewrite JS/TS asset imports like `import logo from './assets/logo.svg'`
 * into inline data-URL assignments: `const logo = "data:image/svg+xml;base64,..."`.
 *
 * This handles Vite-style asset imports that the browser can't resolve
 * at runtime. Mutates the `files` map in place.
 */
function rewriteAssetImports(
  files: Map<string, string>,
  project: ResolvedProject,
): void {
  // Matches: import <binding> from '<specifier>'
  // where the specifier ends with an asset extension
  const assetImportRe = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/g;

  for (const [filePath, content] of files) {
    if (!/\.(js|ts|jsx|tsx|mjs)$/.test(filePath)) continue;

    let modified = content;
    let didModify = false;
    let match: RegExpExecArray | null;

    // Reset lastIndex since we reuse the regex
    assetImportRe.lastIndex = 0;

    while ((match = assetImportRe.exec(content)) !== null) {
      const binding = match[1];
      const specifier = match[2];
      const ext = extensionOf(specifier);

      if (!(ext in ASSET_IMPORT_EXTENSIONS)) continue;

      // Resolve the specifier relative to the importing file
      let resolved: string;
      if (specifier.startsWith('/')) {
        resolved = specifier.slice(1);
      } else {
        resolved = resolvePath(directoryOf(filePath), specifier);
      }

      const mime = ASSET_IMPORT_EXTENSIONS[ext];
      let dataURL: string | null = null;

      // Try text files first (SVGs are stored as text after resolver change)
      const textContent = project.files.get(resolved);
      if (textContent) {
        dataURL = `data:${mime};base64,${btoa(unescape(encodeURIComponent(textContent)))}`;
      }

      // Try binary files
      if (!dataURL) {
        const blob = project.binaryFiles.get(resolved);
        if (blob) {
          // We can't synchronously read blobs — use a blank data URL placeholder
          dataURL = `data:${mime};base64,`;
        }
      }

      // Always replace asset imports to avoid runtime module resolution errors.
      // If we couldn't resolve the asset, use an empty placeholder.
      if (!dataURL) {
        dataURL = `data:${mime};base64,`;
      }

      modified = modified.replace(match[0], `const ${binding} = "${dataURL}";`);
      didModify = true;
    }

    if (didModify) {
      files.set(filePath, modified);
    }
  }
}

// ─── CSS-in-JS imports ─────────────────────────────────────────

/**
 * Extract CSS imported from JS files (`import './styles.css'`)
 * and return the combined CSS content. Also strips the import
 * statement from the JS source (mutates the map).
 */
function extractCSSImports(files: Map<string, string>): string {
  const cssChunks: string[] = [];
  const cssImportRe = /import\s+['"]([^'"]+\.css)['"]\s*;?/g;

  for (const [path, content] of files) {
    if (!/\.(js|ts|jsx|tsx|mjs)$/.test(path)) continue;

    let modified = content;
    let match: RegExpExecArray | null;

    while ((match = cssImportRe.exec(content)) !== null) {
      const cssPath = match[1];
      const resolved = resolvePath(directoryOf(path), cssPath);
      const css = files.get(resolved);
      if (css) {
        cssChunks.push(`/* ${resolved} */\n${css}`);
      }
      // Strip the import from the JS
      modified = modified.replace(match[0], '');
    }

    if (modified !== content) {
      files.set(path, modified);
    }
  }

  return cssChunks.join('\n\n');
}

// ─── import.meta.env injection ─────────────────────────────────

/**
 * Inject an `import.meta.env` polyfill at the top of every JS/TS file
 * in the map.  `import.meta` is per-module — a classic `<script>` in
 * `<head>` can't set it (and would throw a SyntaxError).  By injecting
 * the definition directly into each module, the polyfill runs in the
 * correct module scope.
 *
 * Note: the import rewriter already statically replaces individual
 * properties (`import.meta.env.MODE`, `.PROD`, `.DEV`, `.BASE_URL`,
 * `.SSR`, `.VITE_*`).  This polyfill covers edge cases where code
 * references `import.meta.env` as a whole object, or accesses
 * properties not caught by the static pass.
 */
function injectImportMetaEnv(files: Map<string, string>): void {
  const shim = `if(!import.meta.env){Object.defineProperty(import.meta,'env',{value:{MODE:'production',BASE_URL:'/',PROD:true,DEV:false,SSR:false}});}`;

  for (const [path, content] of files) {
    if (!/\.(js|ts|jsx|tsx|mjs)$/.test(path)) continue;
    files.set(path, shim + '\n' + content);
  }
}

// ─── Utility ───────────────────────────────────────────────────

function directoryOf(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
}

function resolvePath(dir: string, relative: string): string {
  // Strip leading ./
  let cleaned = relative.replace(/^\.\//, '');

  if (!dir) return cleaned;

  // Handle ../
  const parts = dir.split('/');
  const segments = cleaned.split('/');

  for (const seg of segments) {
    if (seg === '..') {
      parts.pop();
    } else if (seg !== '.') {
      parts.push(seg);
    }
  }

  return parts.join('/');
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

function injectIntoHead(html: string, tag: string): string {
  // Insert right before </head>, or before <body>, or at the top
  if (html.includes('</head>')) {
    return html.replace('</head>', `  ${tag}\n</head>`);
  }
  if (html.includes('<body')) {
    return html.replace(/<body/, `${tag}\n<body`);
  }
  return `${tag}\n${html}`;
}
