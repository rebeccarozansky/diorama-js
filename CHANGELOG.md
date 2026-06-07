# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-06-06

### Fixed
- CSS imported from an npm package (e.g. `import 'leaflet/dist/leaflet.css'`) no longer breaks rendering. Previously the import rewriter turned package CSS into an esm.sh JS-module URL (sometimes with a `?deps=` query), so the browser loaded CSS as a module script and failed with a "text/css MIME type" error that aborted the whole module graph, leaving a blank iframe. Package CSS is now loaded as a real stylesheet via `<link rel="stylesheet">` (version-pinned from the project's dependencies), while local CSS is still inlined as `<style>`. CSS Modules and Node-builtin detection are unaffected.

## [0.1.0] - 2026-06-06

### Added
- Core rendering pipeline: GitHubResolver, CacheManager, ProjectAnalyzer, HTMLAssembler, SandboxManager
- Import rewriting with esm.sh, Skypack, and unpkg CDN support
- JSX/TypeScript transpilation via lazy-loaded esbuild-wasm
- React, Vue, and Svelte framework adapters
- Error taxonomy with typed error classes
- Loading strategies: eager, click-to-load, viewport-triggered
- localStorage caching with TTL and automatic eviction
- Comprehensive test suite
