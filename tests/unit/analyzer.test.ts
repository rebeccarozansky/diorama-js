import { describe, it, expect } from 'vitest';
import { analyzeProject } from '../../src/core/analyzer';
import type { ResolvedProject } from '../../src/types';

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

describe('ProjectAnalyzer', () => {
  // ── Static detection ───────────────────────────────────

  it('detects a static project (HTML only)', () => {
    const config = analyzeProject(
      project({ 'index.html': '<h1>Hello</h1>' }),
    );
    expect(config.type).toBe('static');
    expect(config.entryPoint).toBe('index.html');
    expect(config.framework).toBe('none');
  });

  it('detects static with HTML + CSS + JS (no imports)', () => {
    const config = analyzeProject(
      project({
        'index.html': '<script src="app.js"></script>',
        'style.css': 'body { color: red; }',
        'app.js': 'document.body.innerHTML = "hi";',
      }),
    );
    expect(config.type).toBe('static');
  });

  // ── Entry point resolution ─────────────────────────────

  it('finds index.html at root', () => {
    const config = analyzeProject(project({ 'index.html': '<html></html>' }));
    expect(config.entryPoint).toBe('index.html');
  });

  it('finds public/index.html as fallback', () => {
    const config = analyzeProject(
      project({ 'public/index.html': '<html></html>', 'src/app.js': '' }),
    );
    expect(config.entryPoint).toBe('public/index.html');
  });

  it('finds single .html file at root', () => {
    const config = analyzeProject(
      project({ 'app.html': '<html></html>' }),
    );
    expect(config.entryPoint).toBe('app.html');
  });

  it('generates shell when no HTML but JS entry exists', () => {
    const config = analyzeProject(
      project({ 'src/index.js': 'console.log("hi")' }),
    );
    expect(config.entryPoint).toBe('__generated__/index.html');
    expect(config.jsEntryPoint).toBe('src/index.js');
  });

  it('throws when no entry point found', () => {
    expect(() => analyzeProject(project({}))).toThrow('No entry point');
  });

  // ── ESM detection ──────────────────────────────────────

  it('detects static-esm when JS has bare imports (no package.json)', () => {
    const config = analyzeProject(
      project({
        'index.html': '<script type="module" src="app.js"></script>',
        'app.js': "import confetti from 'canvas-confetti';\nconfetti();",
      }),
    );
    expect(config.type).toBe('static-esm');
  });

  it('detects static-esm when package.json exists', () => {
    const config = analyzeProject(
      project({
        'index.html': '<html></html>',
        'package.json': '{"dependencies":{"canvas-confetti":"^2.0.0"}}',
        'app.js': "import confetti from 'canvas-confetti';",
      }),
    );
    expect(config.type).toBe('static-esm');
    expect(config.dependencies).toEqual({ 'canvas-confetti': '^2.0.0' });
  });

  // ── JSX / TypeScript detection ─────────────────────────

  it('detects jsx project (React)', () => {
    const config = analyzeProject(
      project({
        'package.json': '{"dependencies":{"react":"^18.0.0","react-dom":"^18.0.0"}}',
        'src/index.jsx': 'import React from "react";',
        'src/App.jsx': 'export default function App() { return <h1>Hi</h1>; }',
      }),
    );
    expect(config.type).toBe('jsx');
    expect(config.framework).toBe('react');
    expect(config.hasJSX).toBe(true);
  });

  it('detects typescript project', () => {
    const config = analyzeProject(
      project({
        'package.json': '{"devDependencies":{"typescript":"^5.0.0"}}',
        'src/index.ts': 'const x: number = 42;',
        'index.html': '<html></html>',
      }),
    );
    expect(config.type).toBe('typescript');
    expect(config.hasTypeScript).toBe(true);
  });

  it('detects jsx-typescript project', () => {
    const config = analyzeProject(
      project({
        'package.json': '{"dependencies":{"react":"^18.0.0","react-dom":"^18.0.0"},"devDependencies":{"typescript":"^5.0.0"}}',
        'src/index.tsx': 'import React from "react";',
        'src/App.tsx': 'export default function App(): JSX.Element { return <h1>Hi</h1>; }',
      }),
    );
    expect(config.type).toBe('jsx-typescript');
    expect(config.framework).toBe('react');
    expect(config.hasJSX).toBe(true);
    expect(config.hasTypeScript).toBe(true);
  });

  it('detects Preact framework', () => {
    const config = analyzeProject(
      project({
        'package.json': '{"dependencies":{"preact":"^10.0.0"}}',
        'src/index.jsx': 'import { h } from "preact";',
      }),
    );
    expect(config.framework).toBe('preact');
  });

  // ── Overrides ──────────────────────────────────────────

  it('respects projectType override', () => {
    const config = analyzeProject(
      project({ 'index.html': '<html></html>' }),
      'static-esm',
    );
    expect(config.type).toBe('static-esm');
  });

  it('respects entryPoint override', () => {
    const config = analyzeProject(
      project({
        'index.html': '<html></html>',
        'other.html': '<html>other</html>',
      }),
      undefined,
      'other.html',
    );
    expect(config.entryPoint).toBe('other.html');
  });

  // ── Vite detection ─────────────────────────────────────

  it('detects a Vite project via vite.config.ts', () => {
    const config = analyzeProject(
      project({
        'index.html': '<html><head></head><body><script type="module" src="/src/main.tsx"></script></body></html>',
        'vite.config.ts': 'export default {}',
        'package.json': '{"devDependencies":{"vite":"^5.0.0"},"dependencies":{"react":"^18.0.0","react-dom":"^18.0.0"}}',
        'src/main.tsx': 'import React from "react";',
        'src/App.tsx': 'export default function App() { return <h1>Hi</h1>; }',
      }),
    );
    expect(config.type).toBe('vite');
    expect(config.isVite).toBe(true);
    expect(config.framework).toBe('react');
    expect(config.hasJSX).toBe(true);
    expect(config.hasTypeScript).toBe(true);
    expect(config.entryPoint).toBe('index.html');
    expect(config.jsEntryPoint).toBe('src/main.tsx');
  });

  it('detects Vite project via vite in devDependencies (no config file)', () => {
    const config = analyzeProject(
      project({
        'index.html': '<html><body><script type="module" src="/src/main.js"></script></body></html>',
        'package.json': '{"devDependencies":{"vite":"^5.0.0"}}',
        'src/main.js': 'console.log("hello");',
      }),
    );
    expect(config.type).toBe('vite');
    expect(config.isVite).toBe(true);
  });

  it('strips leading / from Vite script src paths', () => {
    const config = analyzeProject(
      project({
        'index.html': '<html><body><script type="module" src="/src/main.tsx"></script></body></html>',
        'vite.config.ts': 'export default {}',
        'package.json': '{"devDependencies":{"vite":"^5.0.0"}}',
        'src/main.tsx': 'console.log("hi");',
      }),
    );
    expect(config.jsEntryPoint).toBe('src/main.tsx');
  });

  it('detects Vite vanilla project (no framework)', () => {
    const config = analyzeProject(
      project({
        'index.html': '<html><body><script type="module" src="/src/main.js"></script></body></html>',
        'vite.config.js': 'export default {}',
        'package.json': '{"devDependencies":{"vite":"^5.0.0"}}',
        'src/main.js': 'document.querySelector("#app").innerHTML = "hello";',
      }),
    );
    expect(config.type).toBe('vite');
    expect(config.isVite).toBe(true);
    expect(config.framework).toBe('none');
    expect(config.hasJSX).toBe(false);
    expect(config.hasTypeScript).toBe(false);
  });

  it('non-Vite projects have isVite=false', () => {
    const config = analyzeProject(
      project({ 'index.html': '<h1>Hello</h1>' }),
    );
    expect(config.isVite).toBe(false);
  });

  it('prioritises src/main.tsx for Vite projects', () => {
    const config = analyzeProject(
      project({
        'vite.config.ts': 'export default {}',
        'package.json': '{"devDependencies":{"vite":"^5.0.0"},"dependencies":{"react":"^18.0.0","react-dom":"^18.0.0"}}',
        'src/main.tsx': 'import React from "react";',
        'src/index.tsx': 'export {};',
      }),
    );
    expect(config.jsEntryPoint).toBe('src/main.tsx');
  });

  // ── Tailwind detection ───────────────────────────

  it('detects Tailwind via @tailwind directives in CSS', () => {
    const config = analyzeProject(
      project({
        'index.html': '<html></html>',
        'src/index.css': '@tailwind base;\n@tailwind utilities;',
      }),
    );
    expect(config.usesTailwind).toBe(true);
  });

  it('detects Tailwind via @apply in CSS', () => {
    const config = analyzeProject(
      project({
        'index.html': '<html></html>',
        'styles.css': '.btn { @apply px-4 py-2; }',
      }),
    );
    expect(config.usesTailwind).toBe(true);
  });

  it('detects Tailwind via a tailwind.config file', () => {
    const config = analyzeProject(
      project({
        'index.html': '<html></html>',
        'tailwind.config.ts': 'export default { theme: {} };',
      }),
    );
    expect(config.usesTailwind).toBe(true);
  });

  it('reports no Tailwind for plain-CSS projects', () => {
    const config = analyzeProject(
      project({
        'index.html': '<html></html>',
        'style.css': 'body { color: red; }',
      }),
    );
    expect(config.usesTailwind).toBe(false);
  });
});
