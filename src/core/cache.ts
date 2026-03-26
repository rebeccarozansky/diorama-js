import type { ResolvedProject, CacheStrategy } from '../types';

// ─── Constants ─────────────────────────────────────────────────

const CACHE_PREFIX = 'diorama:';
const CACHE_META_KEY = 'diorama:__meta__';

interface CacheMeta {
  /** owner/repo → timestamp of last write. */
  entries: Record<string, number>;
}

interface CacheEntry {
  sha: string;
  owner: string;
  repo: string;
  branch: string;
  /** Serialised text files: { relativePath: content } */
  files: Record<string, string>;
  /** Serialised binary files: { relativePath: base64DataURL } */
  binaryFiles: Record<string, string>;
  /** Timestamp of when the entry was written. */
  timestamp: number;
}

// ─── Cache Manager ─────────────────────────────────────────────

export interface CacheManagerOptions {
  /** Enable caching. Default: `true`. */
  enabled?: boolean;
  /** TTL in seconds. Default: `3600` (1 hour). */
  ttl?: number;
  /** Cache strategy. Default: `'normal'`. */
  strategy?: CacheStrategy;
}

export class CacheManager {
  private enabled: boolean;
  private ttl: number;
  private _strategy: CacheStrategy;

  constructor(options: CacheManagerOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.ttl = (options.ttl ?? 3600) * 1000; // convert to ms
    this._strategy = options.strategy ?? 'normal';
  }

  // ─── Public API ────────────────────────────────────────────

  /**
   * Try to read a cached project.
   * Returns `null` on miss, expiry, or if caching is disabled.
   */
  get(owner: string, repo: string, sha: string): ResolvedProject | null {
    if (!this.enabled) return null;
    try {
      const key = this.cacheKey(owner, repo);
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const entry: CacheEntry = JSON.parse(raw);

      // SHA mismatch → stale
      if (entry.sha !== sha) return null;

      // TTL check
      if (Date.now() - entry.timestamp > this.ttl) return null;

      return this.deserialize(entry);
    } catch {
      return null; // corrupted cache — treat as miss
    }
  }

  /**
   * For aggressive strategy: check if we have a recently-cached SHA
   * so we can skip even the tree API call.
   */
  getCachedSHA(owner: string, repo: string): string | null {
    if (!this.enabled || this._strategy !== 'aggressive') return null;
    try {
      const key = this.cacheKey(owner, repo);
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const entry: CacheEntry = JSON.parse(raw);
      // For aggressive strategy, use a shorter TTL (5 minutes)
      const aggressiveTTL = 5 * 60 * 1000;
      if (Date.now() - entry.timestamp > aggressiveTTL) return null;

      return entry.sha;
    } catch {
      return null;
    }
  }

  /**
   * Store a resolved project in cache.
   * Silently handles quota errors by evicting old entries.
   */
  async set(project: ResolvedProject): Promise<void> {
    if (!this.enabled) return;

    const entry = await this.serialize(project);
    const key = this.cacheKey(project.owner, project.repo);

    try {
      this.writeEntry(key, entry, project.owner, project.repo);
    } catch (err) {
      if (isQuotaError(err)) {
        // Evict oldest entry and retry once
        this.evictOldest();
        try {
          this.writeEntry(key, entry, project.owner, project.repo);
        } catch {
          // Quota still exceeded — skip caching, don't error
          console.warn('[Diorama] Cache quota exceeded; skipping cache write.');
        }
      }
    }
  }

  /** Clear cache for a specific repo or all cached projects. */
  clear(repoSlug?: string): void {
    if (repoSlug) {
      const key = `${CACHE_PREFIX}${repoSlug}`;
      localStorage.removeItem(key);
      this.removeFromMeta(repoSlug);
    } else {
      // Clear all Diorama entries
      const meta = this.getMeta();
      for (const slug of Object.keys(meta.entries)) {
        localStorage.removeItem(`${CACHE_PREFIX}${slug}`);
      }
      localStorage.removeItem(CACHE_META_KEY);
    }
  }

  // ─── Internal helpers ──────────────────────────────────────

  private cacheKey(owner: string, repo: string): string {
    return `${CACHE_PREFIX}${owner}/${repo}`;
  }

  private async serialize(project: ResolvedProject): Promise<CacheEntry> {
    const files: Record<string, string> = {};
    for (const [path, content] of project.files) {
      files[path] = content;
    }

    const binaryFiles: Record<string, string> = {};
    for (const [path, blob] of project.binaryFiles) {
      binaryFiles[path] = await blobToBase64(blob);
    }

    return {
      sha: project.sha,
      owner: project.owner,
      repo: project.repo,
      branch: project.branch,
      files,
      binaryFiles,
      timestamp: Date.now(),
    };
  }

  private deserialize(entry: CacheEntry): ResolvedProject {
    const files = new Map<string, string>();
    for (const [path, content] of Object.entries(entry.files)) {
      files.set(path, content);
    }

    const binaryFiles = new Map<string, Blob>();
    for (const [path, dataURL] of Object.entries(entry.binaryFiles)) {
      binaryFiles.set(path, base64ToBlob(dataURL));
    }

    return {
      owner: entry.owner,
      repo: entry.repo,
      branch: entry.branch,
      sha: entry.sha,
      files,
      binaryFiles,
    };
  }

  private writeEntry(
    key: string,
    entry: CacheEntry,
    owner: string,
    repo: string,
  ): void {
    localStorage.setItem(key, JSON.stringify(entry));
    this.updateMeta(`${owner}/${repo}`);
  }

  private getMeta(): CacheMeta {
    try {
      const raw = localStorage.getItem(CACHE_META_KEY);
      return raw ? JSON.parse(raw) : { entries: {} };
    } catch {
      return { entries: {} };
    }
  }

  private updateMeta(slug: string): void {
    const meta = this.getMeta();
    meta.entries[slug] = Date.now();
    localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
  }

  private removeFromMeta(slug: string): void {
    const meta = this.getMeta();
    delete meta.entries[slug];
    localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
  }

  private evictOldest(): void {
    const meta = this.getMeta();
    const entries = Object.entries(meta.entries);
    if (entries.length === 0) return;

    // Sort ascending by timestamp, evict the oldest
    entries.sort((a, b) => a[1] - b[1]);
    const [oldestSlug] = entries[0];
    localStorage.removeItem(`${CACHE_PREFIX}${oldestSlug}`);
    delete meta.entries[oldestSlug];
    localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
  }
}

// ─── Utility ───────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataURL: string): Blob {
  const [header, data] = dataURL.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' ||
      err.code === 22 ||
      err.code === 1014)
  );
}
