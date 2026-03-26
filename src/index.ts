import type {
  DioramaOptions,
  DioramaInstance,
  RenderOptions,
  ResolvedProject,
} from './types';
import { DioramaError } from './errors';
import { resolveProject } from './core/resolver';
import { CacheManager } from './core/cache';
import { analyzeProject } from './core/analyzer';
import { createSandbox, buildErrorHTML } from './core/sandbox';
import { rewriteImports } from './transform/rewriter';
import { transpileAll } from './transform/transpiler';
import { assembleHTML } from './transform/assembler';

// ─── Re-exports ────────────────────────────────────────────────

export { DioramaError } from './errors';
export {
  RepoNotFoundError,
  BranchNotFoundError,
  RateLimitError,
  NetworkError,
  ProjectTypeError,
  NodeBuiltinError,
  TranspileError,
  TranspilerLoadError,
  AssemblyError,
  PackageNotFoundError,
  EntryPointError,
} from './errors';

export type {
  DioramaOptions,
  DioramaInstance,
  RenderOptions,
  ResolvedProject,
  ProjectConfig,
  ProjectType,
  Framework,
  CDNProviderName,
  CacheStrategy,
  LoadingStrategy,
  FrameStyle,
} from './types';

// ─── Diorama class ─────────────────────────────────────────────

export class Diorama {
  private options: Required<DioramaOptions>;
  private cache: CacheManager;

  constructor(options: DioramaOptions = {}) {
    this.options = {
      cache: options.cache ?? true,
      cacheTTL: options.cacheTTL ?? 3600,
      cacheStrategy: options.cacheStrategy ?? 'normal',
      cdnProvider: options.cdnProvider ?? 'esm.sh',
      githubToken: options.githubToken ?? '',
      esbuildWasmURL: options.esbuildWasmURL ?? 'auto',
      maxConcurrentFetches: options.maxConcurrentFetches ?? 6,
      timeout: options.timeout ?? 30_000,
    };

    this.cache = new CacheManager({
      enabled: this.options.cache,
      ttl: this.options.cacheTTL,
      strategy: this.options.cacheStrategy,
    });
  }

  // ─── Render ────────────────────────────────────────────────

  /**
   * Fetch, transform, and render a GitHub project inside a
   * sandboxed iframe.
   *
   * @param container CSS selector or DOM element.
   * @param repoURL   GitHub URL or `owner/repo` shorthand.
   * @param options    Per-render options.
   * @returns A handle for reloading or destroying the instance.
   */
  async render(
    container: string | HTMLElement,
    repoURL: string,
    options: RenderOptions = {},
  ): Promise<DioramaInstance> {
    const renderImpl = async (): Promise<{
      html: string;
      usesESM: boolean;
      repoName: string;
    }> => {
      // 1) Resolve project from GitHub (with cache)
      const project = await this.fetchProject(repoURL, options);
      const repoName = `${project.owner}/${project.repo}`;

      // 2) Analyse project
      const config = analyzeProject(
        project,
        options.projectType,
        options.entryPoint,
      );

      // 3) Transpile if needed (JSX / TypeScript / Vite)
      let files = project.files;
      const needsTranspile =
        config.type === 'jsx' ||
        config.type === 'typescript' ||
        config.type === 'jsx-typescript' ||
        (config.type === 'vite' && (config.hasJSX || config.hasTypeScript));

      if (needsTranspile) {
        files = await transpileAll(
          files,
          config.framework,
          this.options.esbuildWasmURL,
        );
      }

      // 4) Rewrite imports (ESM / JSX / TS / Vite projects)
      if (config.type !== 'static') {
        const reactVersion =
          config.framework === 'react'
            ? config.dependencies['react']
            : undefined;

        for (const [path, content] of files) {
          if (/\.(js|ts|jsx|tsx|mjs)$/.test(path)) {
            const rewritten = rewriteImports(content, {
              dependencies: config.dependencies,
              cdnProvider: this.options.cdnProvider,
              framework: config.framework,
              reactVersion,
              isVite: config.isVite,
            });
            files.set(path, rewritten);
          }
        }
      }

      // 5) Assemble final HTML
      const { html, usesESM } = assembleHTML({
        project,
        config,
        transformedFiles: files,
      });

      return { html, usesESM, repoName };
    };

    // Run pipeline with timeout
    let html: string;
    let usesESM: boolean;
    let repoName: string;

    try {
      const result = await withTimeout(
        renderImpl(),
        this.options.timeout,
      );
      html = result.html;
      usesESM = result.usesESM;
      repoName = result.repoName;
    } catch (err) {
      const dioErr =
        err instanceof DioramaError
          ? err
          : new DioramaError('UNKNOWN', String(err));
      options.onError?.(dioErr);
      html = buildErrorHTML(dioErr.message);
      usesESM = false;
      repoName = repoURL;
    }

    // 6) Inject into sandbox
    const sandbox = createSandbox({
      container,
      html,
      height: options.height,
      sandboxFlags: options.sandbox,
      loading: options.loading,
      frame: options.frame,
      expand: options.expand,
      placeholder: options.placeholder,
      repoName,
      useBlobURL: usesESM,
      onLoad: options.onLoad,
      onError: options.onError,
    });

    // Return instance
    const instance: DioramaInstance = {
      reload: async () => {
        try {
          const result = await renderImpl();
          sandbox.update(result.html);
          options.onLoad?.();
        } catch (err) {
          const dioErr =
            err instanceof DioramaError
              ? err
              : new DioramaError('UNKNOWN', String(err));
          options.onError?.(dioErr);
          sandbox.update(buildErrorHTML(dioErr.message));
        }
      },
      destroy: () => {
        sandbox.destroy();
      },
    };

    return instance;
  }

  // ─── Utilities ─────────────────────────────────────────────

  /**
   * Pre-fetch a project (resolve + cache) without rendering.
   */
  async prefetch(
    repoURL: string,
    options: Pick<RenderOptions, 'branch' | 'subdirectory'> = {},
  ): Promise<void> {
    await this.fetchProject(repoURL, options);
  }

  /**
   * Clear cached data.
   * @param repoSlug Optional `owner/repo` to clear a specific entry.
   */
  clearCache(repoSlug?: string): void {
    this.cache.clear(repoSlug);
  }

  // ─── Internal ──────────────────────────────────────────────

  private async fetchProject(
    repoURL: string,
    options: Pick<RenderOptions, 'branch' | 'subdirectory' | 'include' | 'exclude'>,
  ): Promise<ResolvedProject> {
    const project = await resolveProject(repoURL, {
      githubToken: this.options.githubToken || undefined,
      maxConcurrentFetches: this.options.maxConcurrentFetches,
      branch: options.branch,
      subdirectory: options.subdirectory,
      exclude: options.exclude,
    });

    // Cache the result
    await this.cache.set(project);

    return project;
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new DioramaError('TIMEOUT', `Render timed out after ${ms}ms`)),
      ms,
    );
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
