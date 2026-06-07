import { describe, it, expect } from 'vitest';
import { assembleHTML, HISTORY_GUARD_SCRIPT } from '../../src/transform/assembler';
import { rewriteImports } from '../../src/transform/rewriter';
import type { ResolvedProject, ProjectConfig } from '../../src/types';

function project(files: Record<string, string>): ResolvedProject {
  return {
    owner: 'test',
    repo: 'test',
    branch: 'main',
    sha: 'abc',
    files: new Map(Object.entries(files)),
    binaryFiles: new Map(),
  };
}

function staticConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    type: 'static',
    entryPoint: 'index.html',
    dependencies: {},
    framework: 'none',
    hasJSX: false,
    hasTypeScript: false,
    isVite: false,
    ...overrides,
  };
}

describe('HTMLAssembler', () => {
  // ── Static assembly ────────────────────────────────────

  it('returns the HTML entry as-is for a minimal static project', () => {
    const proj = project({ 'index.html': '<!DOCTYPE html><html><body><h1>Hello</h1></body></html>' });
    const { html, usesESM } = assembleHTML({ project: proj, config: staticConfig() });
    expect(html).toContain('<h1>Hello</h1>');
    expect(usesESM).toBe(false);
  });

  it('inlines local CSS <link> tags', () => {
    const proj = project({
      'index.html': '<html><head><link rel="stylesheet" href="style.css"></head><body></body></html>',
      'style.css': 'body { color: red; }',
    });
    const { html } = assembleHTML({ project: proj, config: staticConfig() });
    expect(html).toContain('<style>');
    expect(html).toContain('body { color: red; }');
    expect(html).not.toContain('href="style.css"');
  });

  it('inlines CSS when href comes before rel (Bootstrap/real-world pattern)', () => {
    const proj = project({
      'index.html': '<html><head><link href="css/styles.css" rel="stylesheet" /></head><body></body></html>',
      'css/styles.css': '.primary { color: blue; }',
    });
    const { html } = assembleHTML({ project: proj, config: staticConfig() });
    expect(html).toContain('<style>');
    expect(html).toContain('.primary { color: blue; }');
    expect(html).not.toContain('href="css/styles.css"');
  });

  it('inlines CSS with href before rel and extra attributes', () => {
    const proj = project({
      'index.html': '<html><head><link href="normalize.css" rel="stylesheet" type="text/css" /></head><body></body></html>',
      'normalize.css': '* { margin: 0; }',
    });
    const { html } = assembleHTML({ project: proj, config: staticConfig() });
    expect(html).toContain('<style>');
    expect(html).toContain('* { margin: 0; }');
  });

  it('preserves external CSS links', () => {
    const proj = project({
      'index.html': '<html><head><link rel="stylesheet" href="https://cdn.example.com/lib.css"></head><body></body></html>',
    });
    const { html } = assembleHTML({ project: proj, config: staticConfig() });
    expect(html).toContain('https://cdn.example.com/lib.css');
  });

  it('preserves external CSS links when href comes before rel', () => {
    const proj = project({
      'index.html': '<html><head><link href="https://fonts.googleapis.com/css?family=Muli" rel="stylesheet" type="text/css" /></head><body></body></html>',
    });
    const { html } = assembleHTML({ project: proj, config: staticConfig() });
    expect(html).toContain('https://fonts.googleapis.com');
  });

  it('inlines local JS <script> tags', () => {
    const proj = project({
      'index.html': '<html><body><script src="app.js"></script></body></html>',
      'app.js': 'console.log("hello");',
    });
    const { html } = assembleHTML({ project: proj, config: staticConfig() });
    expect(html).toContain('console.log("hello")');
    expect(html).not.toContain('src="app.js"');
  });

  it('preserves external script tags', () => {
    const proj = project({
      'index.html': '<html><body><script src="https://cdn.example.com/lib.js"></script></body></html>',
    });
    const { html } = assembleHTML({ project: proj, config: staticConfig() });
    expect(html).toContain('https://cdn.example.com/lib.js');
  });

  it('preserves type="module" on inlined scripts', () => {
    const proj = project({
      'index.html': '<html><body><script type="module" src="app.js"></script></body></html>',
      'app.js': 'export default 42;',
    });
    const { html } = assembleHTML({ project: proj, config: staticConfig() });
    expect(html).toContain('type="module"');
    expect(html).toContain('export default 42;');
  });

  // ── ESM assembly ───────────────────────────────────────

  it('produces usesESM=true for static-esm projects', () => {
    const proj = project({
      'index.html': '<html><head></head><body></body></html>',
      'app.js': 'console.log("hi")',
    });
    const config = staticConfig({ type: 'static-esm' });
    const { usesESM } = assembleHTML({ project: proj, config });
    expect(usesESM).toBe(true);
  });

  it('injects process.env shim for framework projects', () => {
    const proj = project({
      'index.html': '<html><head></head><body></body></html>',
      'src/App.jsx': 'export default function() { return null; }',
    });
    const config = staticConfig({ type: 'jsx', framework: 'react', hasJSX: true });
    const { html } = assembleHTML({ project: proj, config });
    expect(html).toContain('process');
    expect(html).toContain('NODE_ENV');
  });

  // ── Generated shell ────────────────────────────────────

  it('generates an HTML shell when entry is __generated__', () => {
    const proj = project({
      'src/index.jsx': 'export default function App() { return null; }',
    });
    const config = staticConfig({
      type: 'jsx',
      entryPoint: '__generated__/index.html',
      framework: 'react',
      hasJSX: true,
      jsEntryPoint: 'src/index.jsx',
    });
    const { html } = assembleHTML({ project: proj, config });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('createRoot');
  });

  // ── Error cases ────────────────────────────────────────

  it('throws when entry point file is missing', () => {
    const proj = project({});
    expect(() =>
      assembleHTML({
        project: proj,
        config: staticConfig({ entryPoint: 'missing.html' }),
      }),
    ).toThrow('Entry point');
  });

  // ── Vite project assembly ──────────────────────────────

  it('redirects Vite root-relative script src via import map (/src/main.js)', () => {
    const proj = project({
      'index.html': '<html><body><script type="module" src="/src/main.js"></script></body></html>',
      'src/main.js': 'console.log("vite app");',
    });
    const config = staticConfig({ type: 'vite', isVite: true });
    const { html, usesESM } = assembleHTML({ project: proj, config });
    // Script src is replaced with an inline import using bare specifier prefix
    expect(html).toContain("import '__diorama__/src/main.js'");
    expect(html).toContain('type="module"');
    expect(html).toContain('importmap');
    expect(html).toContain('__diorama__/src/main.js');
    expect(usesESM).toBe(true);
  });

  it('inlines Vite root-relative CSS href (/src/style.css)', () => {
    const proj = project({
      'index.html': '<html><head><link rel="stylesheet" href="/src/style.css"></head><body></body></html>',
      'src/style.css': 'body { background: #111; }',
    });
    const config = staticConfig({ type: 'vite', isVite: true });
    const { html } = assembleHTML({ project: proj, config });
    expect(html).toContain('body { background: #111; }');
    expect(html).toContain('<style>');
  });

  it('injects import.meta.env shim into Vite JS modules (not classic <script>)', () => {
    const proj = project({
      'index.html': '<html><head></head><body></body></html>',
      'src/main.js': 'console.log("hello");',
    });
    const config = staticConfig({ type: 'vite', isVite: true });
    const { html } = assembleHTML({ project: proj, config });
    // Shim must NOT be in a classic <script> (SyntaxError: import.meta is module-only)
    expect(html).not.toContain('<script>if(!import.meta.env)');
    // Shim should be in the data URI module (base64-encoded)
    // Decode the data URI to verify
    const dataUriMatch = html.match(/data:application\/javascript;base64,([A-Za-z0-9+/=]+)/);
    expect(dataUriMatch).toBeTruthy();
    const decoded = decodeURIComponent(escape(atob(dataUriMatch![1])));
    expect(decoded).toContain('import.meta');
    expect(decoded).toContain('MODE');
  });

  it('extracts CSS imports from Vite JS files', () => {
    const files = {
      'index.html': '<html><head></head><body></body></html>',
      'src/main.js': "import './style.css';\nconsole.log('hi');",
      'src/style.css': '.app { color: blue; }',
    };
    const proj = project(files);
    const config = staticConfig({ type: 'vite', isVite: true });
    const { html } = assembleHTML({ project: proj, config });
    expect(html).toContain('.app { color: blue; }');
  });

  it('rewrites relative imports to bare specifiers in import map blobs', () => {
    const proj = project({
      'index.html': '<html><body><script type="module" src="/src/main.js"></script></body></html>',
      'src/main.js': "import { setup } from './counter.js';\nsetup();",
      'src/counter.js': 'export function setup() { console.log("count"); }',
    });
    const config = staticConfig({ type: 'vite', isVite: true });
    const { html } = assembleHTML({ project: proj, config });
    // Import map should contain bare-specifier entries for both files
    expect(html).toContain('__diorama__/src/main.js');
    expect(html).toContain('__diorama__/src/counter.js');
    expect(html).toContain('importmap');
    // The inline script entry point should also use the prefix
    expect(html).toContain("import '__diorama__/src/main.js'");
    // Verify no leftover relative `./src/` paths in the import map keys
    expect(html).not.toMatch(/"\.\/src\/main\.js"/);
  });

  it('rewrites asset imports to data URLs', () => {
    const proj = project({
      'index.html': '<html><body><script type="module" src="/src/main.js"></script></body></html>',
      'src/main.js': "import logo from './assets/icon.svg';\nconsole.log(logo);",
      'src/assets/icon.svg': '<svg xmlns=\"http://www.w3.org/2000/svg\"><circle r=\"10\"/></svg>',
    });
    const config = staticConfig({ type: 'vite', isVite: true });
    const { html } = assembleHTML({ project: proj, config });
    expect(html).toContain('importmap');
    // After assembly, the files map should have the asset import rewritten
    const mainContent = proj.files.get('src/main.js')!;
    expect(mainContent).toContain('data:image/svg+xml;base64,');
    expect(mainContent).not.toContain("import logo from './assets/icon.svg'");
  });

  it('assembles a realistic Vite project with CSS, assets, and inter-file imports', () => {
    const proj = project({
      'index.html': [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        '    <title>Vite + TS</title>',
        '  </head>',
        '  <body>',
        '    <div id="app"></div>',
        '    <script type="module" src="/src/main.ts"></script>',
        '  </body>',
        '</html>',
      ].join('\n'),
      'src/main.ts': [
        "import './style.css'",
        "import logo from './assets/logo.svg'",
        "import { setupCounter } from './counter.ts'",
        "",
        'document.querySelector("#app").innerHTML = `',
        '  <img src="${logo}" />',
        '  <button id="counter"></button>',
        '`',
        "",
        'setupCounter(document.querySelector("#counter"))',
      ].join('\n'),
      'src/counter.ts': [
        'export function setupCounter(el) {',
        '  let count = 0',
        '  el.addEventListener("click", () => { el.textContent = `count: ${++count}` })',
        '  el.textContent = "count: 0"',
        '}',
      ].join('\n'),
      'src/style.css': ':root { --c: red; }\nbody { color: var(--c); margin: 0; }',
      'src/assets/logo.svg': '<svg><circle r="5"/></svg>',
      'package.json': '{"devDependencies":{"vite":"^5.0.0","typescript":"^5.0.0"}}',
    });
    const config = staticConfig({
      type: 'vite',
      isVite: true,
      hasTypeScript: true,
      entryPoint: 'index.html',
      jsEntryPoint: 'src/main.ts',
    });

    const { html, usesESM } = assembleHTML({ project: proj, config });

    // Should be ESM
    expect(usesESM).toBe(true);

    // CSS from JS import should be injected in <head> as <style>
    expect(html).toContain('<style>');
    expect(html).toContain('--c: red');
    expect(html).toContain('body { color: var(--c); margin: 0; }');

    // Import map should be present with bare-specifier keys
    expect(html).toContain('importmap');
    expect(html).toContain('__diorama__/src/main.ts');
    expect(html).toContain('__diorama__/src/counter.ts');

    // Entry point script should use bare-specifier import
    expect(html).toContain("import '__diorama__/src/main.ts'");

    // Original <script src="..."> should be gone
    expect(html).not.toContain('src="/src/main.ts"');

    // Asset import should be rewritten to data URL in the files map
    const mainContent = proj.files.get('src/main.ts')!;
    expect(mainContent).toContain('data:image/svg+xml;base64,');
    expect(mainContent).not.toContain("import logo from");

    // CSS import should be stripped from the JS
    expect(mainContent).not.toContain("import './style.css'");

    // import.meta.env shim should be in the data URI modules, NOT in a classic <script>
    expect(html).not.toContain('<script>if(!import.meta.env)');
    const dataUriMatch = html.match(/data:application\/javascript;base64,([A-Za-z0-9+/=]+)/);
    expect(dataUriMatch).toBeTruthy();
    const decoded = decodeURIComponent(escape(atob(dataUriMatch![1])));
    expect(decoded).toContain('import.meta');
  });

  // ── Package CSS imports (regression: blank render) ─────

  it('loads package CSS through the full pipeline as a stylesheet link, not a JS module', () => {
    const deps = { leaflet: '1.9.4', react: '18.3.1', 'react-dom': '18.3.1' };
    const proj = project({
      'index.html':
        '<html><head></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
      'src/main.jsx': [
        "import 'leaflet/dist/leaflet.css';",
        "import 'leaflet.markercluster/dist/MarkerCluster.css';",
        "import './index.css';",
        "console.log('boot');",
      ].join('\n'),
      'src/index.css': '#root { color: green; }',
    });

    // Mirror the render pipeline: rewriteImports runs BEFORE assembleHTML.
    // This is what previously mangled the package CSS into an esm.sh JS-module
    // URL (with ?deps) that the CSS extractor could no longer recognise.
    const files = proj.files;
    for (const [path, content] of files) {
      if (/\.(js|ts|jsx|tsx|mjs)$/.test(path)) {
        files.set(
          path,
          rewriteImports(content, {
            dependencies: deps,
            framework: 'react',
            reactVersion: deps.react,
            isVite: true,
          }),
        );
      }
    }

    const config = staticConfig({
      type: 'vite',
      isVite: true,
      hasJSX: true,
      framework: 'react',
      jsEntryPoint: 'src/main.jsx',
      dependencies: deps,
    });

    const { html } = assembleHTML({ project: proj, config, transformedFiles: files });

    // Package CSS → real stylesheet <link> from the CDN (version-pinned when known).
    expect(html).toContain(
      '<link rel="stylesheet" href="https://esm.sh/leaflet@1.9.4/dist/leaflet.css">',
    );
    expect(html).toContain(
      '<link rel="stylesheet" href="https://esm.sh/leaflet.markercluster/dist/MarkerCluster.css">',
    );

    // Local CSS → inlined <style>.
    expect(html).toContain('#root { color: green; }');

    // Cascade: package <link> precedes local <style> so local rules win.
    expect(html.indexOf('leaflet@1.9.4/dist/leaflet.css')).toBeLessThan(
      html.indexOf('#root { color: green; }'),
    );

    // The CSS imports are stripped from the JS module entirely — they must
    // never reach the browser as module scripts (the cause of the blank
    // render: "Expected a JavaScript module but got text/css").
    const main = files.get('src/main.jsx')!;
    expect(main).not.toContain('.css');
    expect(main).not.toContain('esm.sh');
    expect(main).toContain("console.log('boot')");
  });

  it('does not treat CSS Module imports (with a binding) as side-effect stylesheets', () => {
    const proj = project({
      'index.html': '<html><head></head><body></body></html>',
      'src/main.jsx': [
        "import styles from './app.module.css';",
        'console.log(styles);',
      ].join('\n'),
      'src/app.module.css': '.title { color: red; }',
    });
    const config = staticConfig({ type: 'vite', isVite: true, hasJSX: true });
    const { html } = assembleHTML({ project: proj, config });

    // CSS Modules must NOT be turned into a CDN stylesheet <link>…
    expect(html).not.toContain('rel="stylesheet" href="https://esm.sh');
    // …and the binding import is left untouched for downstream handling.
    expect(proj.files.get('src/main.jsx')).toContain(
      "import styles from './app.module.css'",
    );
  });

  // ── Tailwind CSS support ──────────────────────

  it('injects the Tailwind Play CDN, wraps directive CSS, and inlines a plain config', () => {
    const proj = project({
      'index.html':
        '<html><head></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
      'src/main.jsx': "import './index.css';\nconsole.log('app');",
      'src/index.css':
        '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n.brand { color: var(--ink); }',
      'tailwind.config.js': [
        'export default {',
        '  content: ["./index.html", "./src/**/*.{js,jsx}"],',
        '  theme: {',
        '    extend: {',
        "      colors: { ink: '#1a1a1a' },",
        "      fontFamily: { sans: ['Inter', 'sans-serif'] },",
        '    },',
        '  },',
        '};',
      ].join('\n'),
    });
    const config = staticConfig({ type: 'vite', isVite: true, hasJSX: true });
    const { html } = assembleHTML({ project: proj, config });

    // Play CDN injected once, and deferred so it never blocks parsing.
    expect(html).toContain('<script src="https://cdn.tailwindcss.com" defer></script>');
    expect(html.match(/cdn\.tailwindcss\.com/g)).toHaveLength(1);

    // Directive CSS promoted to text/tailwindcss so the CDN compiles it.
    expect(html).toContain('<style type="text/tailwindcss">');
    expect(html).toContain('@tailwind base;');

    // Plain-object config set on a global BEFORE the CDN script, so it's ready
    // when the (deferred) CDN initialises.
    expect(html).toContain('window.tailwind = { config: {');
    expect(html).toContain("ink: '#1a1a1a'");
    expect(html.indexOf('window.tailwind = { config:')).toBeLessThan(
      html.indexOf('cdn.tailwindcss.com'),
    );
  });

  it('detects @apply-only CSS and wraps it as text/tailwindcss', () => {
    const proj = project({
      'index.html': '<html><head></head><body></body></html>',
      'src/main.jsx': "import './styles.css';",
      'src/styles.css': '.btn { @apply px-4 py-2 rounded; }',
    });
    const config = staticConfig({ type: 'vite', isVite: true, hasJSX: true });
    const { html } = assembleHTML({ project: proj, config });

    expect(html).toContain('<script src="https://cdn.tailwindcss.com" defer></script>');
    expect(html).toContain('<style type="text/tailwindcss">');
    expect(html).toContain('@apply px-4 py-2 rounded');
    // No config file → no inlined config.
    expect(html).not.toContain('window.tailwind');
  });

  it('does not inject Tailwind for non-Tailwind projects', () => {
    const proj = project({
      'index.html': '<html><head></head><body><div id="root"></div></body></html>',
      'src/main.jsx': "import './index.css';\nconsole.log('app');",
      'src/index.css': '#root { color: green; }',
    });
    const config = staticConfig({ type: 'vite', isVite: true, hasJSX: true });
    const { html } = assembleHTML({ project: proj, config });

    expect(html).not.toContain('tailwindcss');
    // Plain CSS is still inlined as a normal <style>.
    expect(html).toContain('<style>');
    expect(html).toContain('#root { color: green; }');
  });

  it('respects tailwind: false even when directives are present', () => {
    const proj = project({
      'index.html': '<html><head></head><body></body></html>',
      'src/main.jsx': "import './index.css';",
      'src/index.css': '@tailwind base;\n@tailwind utilities;',
    });
    const config = staticConfig({ type: 'vite', isVite: true, hasJSX: true });
    const { html } = assembleHTML({ project: proj, config, tailwind: false });

    expect(html).not.toContain('cdn.tailwindcss.com');
    expect(html).not.toContain('text/tailwindcss');
    // CSS is still present (just not compiled), inlined as a normal <style>.
    expect(html).toContain('@tailwind base;');
    expect(html).toContain('<style>');
  });

  it('forces Tailwind injection with tailwind: true (static path, no detection)', () => {
    const proj = project({
      'index.html': '<html><head></head><body><div class="flex h-full"></div></body></html>',
    });
    const config = staticConfig({ type: 'static' });
    const { html, usesESM } = assembleHTML({ project: proj, config, tailwind: true });

    expect(usesESM).toBe(false);
    expect(html).toContain('<script src="https://cdn.tailwindcss.com" defer></script>');
  });

  it('wraps Tailwind directive CSS inlined from a <link> in static projects', () => {
    const proj = project({
      'index.html':
        '<html><head><link rel="stylesheet" href="styles.css"></head><body class="p-4"></body></html>',
      'styles.css': '@tailwind base;\n@tailwind utilities;',
    });
    const config = staticConfig({ type: 'static' });
    const { html } = assembleHTML({ project: proj, config });

    expect(html).toContain('<script src="https://cdn.tailwindcss.com" defer></script>');
    expect(html).toContain('<style type="text/tailwindcss">');
    expect(html).not.toContain('href="styles.css"');
  });

  it('skips config inlining for non-plain (require/function) Tailwind configs', () => {
    const proj = project({
      'index.html': '<html><head></head><body></body></html>',
      'src/main.jsx': "import './index.css';",
      'src/index.css': '@tailwind utilities;',
      'tailwind.config.js': [
        "const plugin = require('tailwindcss/plugin');",
        'export default { plugins: [plugin(function () {})] };',
      ].join('\n'),
    });
    const config = staticConfig({ type: 'vite', isVite: true, hasJSX: true });
    const { html } = assembleHTML({ project: proj, config });

    // Detection still succeeds, so the CDN is injected…
    expect(html).toContain('<script src="https://cdn.tailwindcss.com" defer></script>');
    // …but the unsafe config is NOT inlined.
    expect(html).not.toContain('window.tailwind');
  });

  // ── Tailwind CDN non-blocking (Bug A) + History API guard (Bug B) ──

  it('loads the Tailwind CDN deferred so it never blocks the import map or module entry', () => {
    const proj = project({
      'index.html':
        '<html><head></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
      'src/main.jsx': "import './index.css';\nconsole.log('app');",
      'src/index.css': '@tailwind utilities;',
    });
    const config = staticConfig({ type: 'vite', isVite: true, hasJSX: true });
    const { html } = assembleHTML({ project: proj, config });

    // CDN must be deferred — a blocking classic script stalls the module graph
    // and leaves the app blank.
    expect(html).toMatch(/<script src="https:\/\/cdn\.tailwindcss\.com" defer><\/script>/);
    // The import map and module entry are still present and parse regardless.
    expect(html).toContain('type="importmap"');
    expect(html).toContain("import '__diorama__/src/main.jsx'");
  });

  it('injects a History API guard before the app module entry', () => {
    const proj = project({
      'index.html':
        '<html><head></head><body><script type="module" src="/src/main.jsx"></script></body></html>',
      'src/main.jsx': "history.replaceState('s', '', '?x=1');",
    });
    const config = staticConfig({ type: 'vite', isVite: true, hasJSX: true });
    const { html } = assembleHTML({ project: proj, config });

    // Guard present and placed before the (deferred) module entry, so it patches
    // history before app code runs.
    expect(html).toContain("['pushState','replaceState']");
    expect(html.indexOf('pushState')).toBeLessThan(html.indexOf("import '__diorama__"));
  });

  it('the History API guard no-ops SecurityErrors thrown at an opaque origin', () => {
    // Mock a history whose URL-bearing calls throw (as they do at origin 'null').
    const mockHistory = {
      pushState(_s: unknown, _t: unknown, url?: unknown) {
        if (url != null) throw new Error("SecurityError: origin 'null'");
      },
      replaceState(_s: unknown, _t: unknown, url?: unknown) {
        if (url != null) throw new Error("SecurityError: origin 'null'");
      },
    };
    // Apply the guard to the mock, then exercise it.
    new Function('history', HISTORY_GUARD_SCRIPT)(mockHistory);

    expect(() => mockHistory.replaceState('state', '', '?x=1')).not.toThrow();
    expect(() => mockHistory.pushState({}, '', '?y=2')).not.toThrow();
    // A call without a URL still works (nothing to swallow).
    expect(() => mockHistory.replaceState('state', '')).not.toThrow();
  });
});
