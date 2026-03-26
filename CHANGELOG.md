# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Core rendering pipeline: GitHubResolver, CacheManager, ProjectAnalyzer, HTMLAssembler, SandboxManager
- Import rewriting with esm.sh, Skypack, and unpkg CDN support
- JSX/TypeScript transpilation via lazy-loaded esbuild-wasm
- React, Vue, and Svelte framework adapters
- Error taxonomy with typed error classes
- Loading strategies: eager, click-to-load, viewport-triggered
- localStorage caching with TTL and automatic eviction
- Comprehensive test suite
