# Contributing to Diorama

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/becca/diorama.git
   cd diorama
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run tests:**
   ```bash
   npm test              # Run once
   npm run test:watch    # Watch mode
   ```

4. **Build:**
   ```bash
   npm run build
   ```

5. **Type check:**
   ```bash
   npm run typecheck
   ```

## Project Structure

```
src/
├── core/           # Core pipeline modules
│   ├── resolver.ts    # GitHub URL parsing + file fetching
│   ├── cache.ts       # localStorage cache layer
│   ├── analyzer.ts    # Project type detection
│   └── sandbox.ts     # Iframe creation + lifecycle
├── transform/      # File transformation modules
│   ├── rewriter.ts    # Bare import → CDN URL rewriting
│   ├── transpiler.ts  # esbuild-wasm JSX/TS transpilation
│   └── assembler.ts   # Final HTML construction
├── adapters/       # Framework wrappers
│   ├── react.tsx
│   ├── vue.ts
│   └── svelte.ts
├── errors.ts       # Error classes
├── types.ts        # Public TypeScript types
└── index.ts        # Main entry + Diorama class
```

## Pull Request Process

1. Fork the repo and create a feature branch from `main`.
2. Write tests for any new functionality.
3. Ensure all tests pass (`npm test`).
4. Ensure no type errors (`npm run typecheck`).
5. Open a PR with a clear description of what changed and why.

## Reporting Bugs

Please use the [GitHub Issues](https://github.com/becca/diorama/issues) page and include:

- The GitHub URL you tried to render
- The error message (if any)
- Your browser and version
- Steps to reproduce

## Code of Conduct

Be kind, be constructive, be welcoming. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
