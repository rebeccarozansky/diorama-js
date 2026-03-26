import { describe, it, expect } from 'vitest';
import { rewriteImports } from '../../src/transform/rewriter';
import { NodeBuiltinError } from '../../src/errors';

describe('ImportRewriter', () => {
  const deps = {
    react: '18.2.0',
    'react-dom': '18.2.0',
    'canvas-confetti': '1.9.0',
    lodash: '4.17.21',
    '@scope/pkg': '2.0.0',
  };

  // ── Basic rewrites ─────────────────────────────────────

  it('rewrites a default import', () => {
    const input = `import confetti from 'canvas-confetti';`;
    const output = rewriteImports(input, { dependencies: deps });
    expect(output).toContain('https://esm.sh/canvas-confetti@1.9.0');
  });

  it('rewrites a named import', () => {
    const input = `import { render } from 'react-dom';`;
    const output = rewriteImports(input, { dependencies: deps });
    expect(output).toContain('https://esm.sh/react-dom@18.2.0');
  });

  it('rewrites a namespace import', () => {
    const input = `import * as React from 'react';`;
    const output = rewriteImports(input, { dependencies: deps });
    expect(output).toContain('https://esm.sh/react@18.2.0');
  });

  it('rewrites a deep import', () => {
    const input = `import { createRoot } from 'react-dom/client';`;
    const output = rewriteImports(input, { dependencies: deps });
    expect(output).toContain('https://esm.sh/react-dom@18.2.0/client');
  });

  it('rewrites scoped package imports', () => {
    const input = `import { something } from '@scope/pkg';`;
    const output = rewriteImports(input, { dependencies: deps });
    expect(output).toContain('https://esm.sh/@scope/pkg@2.0.0');
  });

  it('rewrites dynamic imports', () => {
    const input = `const mod = await import('lodash');`;
    const output = rewriteImports(input, { dependencies: deps });
    expect(output).toContain('https://esm.sh/lodash@4.17.21');
  });

  it('rewrites re-exports', () => {
    const input = `export { default } from 'react';`;
    const output = rewriteImports(input, { dependencies: deps });
    expect(output).toContain('https://esm.sh/react@18.2.0');
  });

  it('rewrites star re-exports', () => {
    const input = `export * from 'lodash';`;
    const output = rewriteImports(input, { dependencies: deps });
    expect(output).toContain('https://esm.sh/lodash@4.17.21');
  });

  // ── Does NOT rewrite ──────────────────────────────────

  it('leaves relative imports alone', () => {
    const input = `import { foo } from './utils.js';`;
    const output = rewriteImports(input, { dependencies: deps });
    expect(output).toBe(input);
  });

  it('leaves absolute URL imports alone', () => {
    const input = `import { bar } from 'https://cdn.example.com/lib.js';`;
    const output = rewriteImports(input, { dependencies: deps });
    expect(output).toBe(input);
  });

  it('leaves parent-relative imports alone', () => {
    const input = `import { baz } from '../shared/utils.js';`;
    const output = rewriteImports(input, { dependencies: deps });
    expect(output).toBe(input);
  });

  // ── Version handling ───────────────────────────────────

  it('omits version for packages not in dependencies', () => {
    const input = `import something from 'unknown-pkg';`;
    const output = rewriteImports(input, { dependencies: deps });
    expect(output).toContain("'https://esm.sh/unknown-pkg'");
  });

  // ── CDN providers ──────────────────────────────────────

  it('supports skypack CDN', () => {
    const input = `import React from 'react';`;
    const output = rewriteImports(input, {
      dependencies: deps,
      cdnProvider: 'skypack',
    });
    expect(output).toContain('https://cdn.skypack.dev/react@18.2.0');
  });

  it('supports unpkg CDN', () => {
    const input = `import React from 'react';`;
    const output = rewriteImports(input, {
      dependencies: deps,
      cdnProvider: 'unpkg',
    });
    expect(output).toContain('https://unpkg.com/react@18.2.0?module');
  });

  // ── Node built-in detection ────────────────────────────

  it('throws NodeBuiltinError for fs import', () => {
    const input = `import fs from 'fs';`;
    expect(() => rewriteImports(input, { dependencies: deps })).toThrow(
      NodeBuiltinError,
    );
  });

  it('throws NodeBuiltinError for path import', () => {
    const input = `import path from 'path';`;
    expect(() => rewriteImports(input, { dependencies: deps })).toThrow(
      NodeBuiltinError,
    );
  });

  it('throws NodeBuiltinError for node: prefixed imports', () => {
    const input = `import { readFile } from 'node:fs';`;
    expect(() => rewriteImports(input, { dependencies: deps })).toThrow(
      NodeBuiltinError,
    );
  });

  // ── esm.sh deps hint ──────────────────────────────────

  it('adds ?deps hint for React ecosystem packages', () => {
    const input = `import styled from 'styled-components';`;
    const output = rewriteImports(input, {
      dependencies: { ...deps, 'styled-components': '6.0.0' },
      framework: 'react',
      reactVersion: '18.2.0',
    });
    expect(output).toContain('?deps=react@18.2.0,react-dom@18.2.0');
  });

  it('does NOT add ?deps hint to react itself', () => {
    const input = `import React from 'react';`;
    const output = rewriteImports(input, {
      dependencies: deps,
      framework: 'react',
      reactVersion: '18.2.0',
    });
    expect(output).not.toContain('?deps');
  });

  // ── Vite import.meta.env rewriting ─────────────────────

  it('replaces import.meta.env.MODE with production string', () => {
    const input = `const mode = import.meta.env.MODE;`;
    const output = rewriteImports(input, { isVite: true });
    expect(output).toContain('"production"');
    expect(output).not.toContain('import.meta.env.MODE');
  });

  it('replaces import.meta.env.PROD with true', () => {
    const input = `if (import.meta.env.PROD) { console.log("prod"); }`;
    const output = rewriteImports(input, { isVite: true });
    expect(output).toContain('if (true)');
  });

  it('replaces import.meta.env.DEV with false', () => {
    const input = `if (import.meta.env.DEV) { console.log("dev"); }`;
    const output = rewriteImports(input, { isVite: true });
    expect(output).toContain('if (false)');
  });

  it('replaces import.meta.env.BASE_URL with /', () => {
    const input = `const base = import.meta.env.BASE_URL;`;
    const output = rewriteImports(input, { isVite: true });
    expect(output).toContain('"/"');
  });

  it('replaces VITE_ prefixed env vars with empty string', () => {
    const input = `const key = import.meta.env.VITE_API_KEY;`;
    const output = rewriteImports(input, { isVite: true });
    expect(output).toContain('""');
    expect(output).not.toContain('VITE_API_KEY');
  });

  it('does NOT replace import.meta.env when isVite is false', () => {
    const input = `const mode = import.meta.env.MODE;`;
    const output = rewriteImports(input, { isVite: false });
    expect(output).toContain('import.meta.env.MODE');
  });
});
