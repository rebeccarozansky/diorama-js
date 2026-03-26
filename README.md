# Diorama

**JavaScript library that renders GitHub-hosted web projects in a sandboxed iframe.**

Diorama is an iframe wrapper that allows developers to easily showcase existing projects via just a Github link on a portfolio or any other website. Give Diorama a GitHub URL and it fetches the source files, transforms them as needed (import rewriting, JSX/TypeScript transpilation), and renders the running project inline, all entirely in the browser.

## Quick Start

### Install

```bash
npm install diorama-js
```

### Vanilla JS

```javascript
import { Diorama } from 'diorama-js';

const diorama = new Diorama();

await diorama.render('#container', 'https://github.com/user/repo', {
  height: '500px',
  loading: 'eager',
});
```

### React

```tsx
import { DioramaPreview } from 'diorama-js/react';

function Portfolio() {
  return (
    <DioramaPreview
      repo="https://github.com/user/repo"
      loading="click"
      height="500px"
      onLoad={() => console.log('loaded!')}
    />
  );
}
```

### Vue

```javascript
<template>
  <DioramaPreview
    repo="https://github.com/user/repo"
    loading="viewport"
    height="500px"
  />
</template>

<script setup>
import { DioramaPreview } from 'diorama-js/vue';
</script>
```

### Svelte

```javascript
<script>
  import { dioramaAction } from 'diorama-js/svelte';
</script>

<div use:dioramaAction={{ repo: 'user/repo', height: '500px' }} />
```

## Supported Project Types

### Tier 1 — Static (no build step)
- `index.html` + CSS + JS with no npm imports
- Projects using CDN-loaded libraries via `<script>` tags
- Canvas games, D3 visualizations, vanilla single-page apps

### Tier 2 — Static with ESM imports
- ES module `import` statements from npm packages
- Bare imports are automatically rewritten to CDN URLs ([esm.sh](https://esm.sh))
- Relative imports resolve via import maps

### Tier 3 — JSX and TypeScript
- React and Preact projects with `.jsx` / `.tsx` files
- TypeScript projects with `.ts` files
- Transpilation via esbuild-wasm (lazy-loaded, ~8MB)

## API Reference

### `new Diorama(options?)`

Create a Diorama instance with global configuration.

| Option | Type | Default | Description |
|---|---|---|---|
| `cache` | `boolean` | `true` | Enable localStorage caching |
| `cacheTTL` | `number` | `3600` | Cache TTL in seconds |
| `cacheStrategy` | `'normal' \| 'aggressive'` | `'normal'` | Aggressive skips even the tree API call within 5 min |
| `cdnProvider` | `'esm.sh' \| 'skypack' \| 'unpkg'` | `'esm.sh'` | CDN for resolving bare npm imports |
| `githubToken` | `string` | `undefined` | GitHub PAT for higher API rate limits (60/h → 5000/h) |
| `esbuildWasmURL` | `string` | `'auto'` | Custom URL for the esbuild-wasm binary |
| `maxConcurrentFetches` | `number` | `6` | Parallel file fetch limit |
| `timeout` | `number` | `30000` | Total render timeout in ms |

### `diorama.render(container, repoURL, options?)`

Render a GitHub project. Returns a `Promise<DioramaInstance>`.

| Option | Type | Default | Description |
|---|---|---|---|
| `branch` | `string` | auto | Branch to render |
| `subdirectory` | `string` | — | Subdirectory within the repo |
| `loading` | `'eager' \| 'click' \| 'viewport'` | `'eager'` | When to create the iframe |
| `placeholder` | `string` | — | Image URL for click/viewport placeholder |
| `height` | `string` | `'500px'` | CSS height of the iframe |
| `sandbox` | `string[]` | `['allow-scripts']` | Iframe sandbox flags |
| `projectType` | `string` | auto | Override project type detection |
| `entryPoint` | `string` | auto | Override entry point detection |
| `onLoad` | `() => void` | — | Called when rendering completes |
| `onError` | `(err) => void` | — | Called on failure |
| `frame` | `FrameStyle` | `'none'` | Decorative frame wrapping the iframe |
| `expand` | `boolean` | `false` | Allow click-to-expand fullscreen lightbox |

#### Frame styles

| Value | Description |
|---|---|
| `'none'` | No frame (default) |
| `'standard'` | Clean border with subtle shadow |
| `'polaroid'` | Polaroid photo with white border and handwritten caption |
| `'museum'` | Ornate golden frame with inner mat |
| `'terminal'` | Dark terminal chrome with traffic-light dots |
| `'postcard'` | Vintage postcard with stamp and postmark |
| `'blueprint'` | Technical blueprint with grid overlay |
| `'browser'` | Browser window chrome with address bar |

### Instance methods

```javascript
const instance = await diorama.render('#el', 'user/repo');

instance.reload();   // Re-fetch and re-render
instance.destroy();  // Clean up iframe, Blob URLs, observers
```

### Utility methods

```javascript
diorama.clearCache();              // Clear all cached projects
diorama.clearCache('user/repo');   // Clear a specific repo
diorama.prefetch('user/repo');     // Pre-fetch without rendering
```

## Error Handling

All errors extend `DioramaError` with a `code` property:

| Error | Code | Trigger |
|---|---|---|
| `RepoNotFoundError` | `REPO_NOT_FOUND` | Repository doesn't exist or is private |
| `BranchNotFoundError` | `BRANCH_NOT_FOUND` | Branch doesn't exist |
| `RateLimitError` | `RATE_LIMIT` | GitHub API rate limit exceeded |
| `NetworkError` | `NETWORK_ERROR` | Fetch failures or timeouts |
| `NodeBuiltinError` | `NODE_BUILTIN` | Project imports a Node.js module |
| `TranspileError` | `TRANSPILE_FAILED` | Syntax error in JSX/TS |
| `EntryPointError` | `NO_ENTRY_POINT` | No entry point found |

Errors are displayed as a styled message inside the iframe, so users always see actionable feedback.

## Not Supported

These require server-side runtimes and is currently not supported:

- Next.js, Remix, SvelteKit, Astro
- Node.js APIs (`fs`, `path`, `crypto`, `http`, etc.)
- Backend servers or database connections

## Browser Support

Chrome 89+, Firefox 108+, Safari 16.4+, Edge 89+ (import maps required for ESM projects).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
