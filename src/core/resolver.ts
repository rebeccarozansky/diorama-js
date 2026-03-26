import {
  RepoNotFoundError,
  BranchNotFoundError,
  RateLimitError,
  NetworkError,
} from '../errors';
import type { ResolvedProject } from '../types';

// ─── Constants ─────────────────────────────────────────────────

const GITHUB_API = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';

/** File extensions treated as binary. */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.ogg', '.wav', '.webm',
  '.pdf', '.zip',
]);

/** Paths that are always skipped. */
const DEFAULT_SKIP_DIRS = [
  'node_modules/',
  '.git/',
  '.github/',
  '__tests__/',
];

const DEFAULT_SKIP_FILES = [
  'README.md',
  'LICENSE',
  'LICENSE.md',
  '.gitignore',
  '.env',
  '.env.local',
  '.env.production',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

const DEFAULT_SKIP_PATTERNS = [
  /\.test\.\w+$/,
  /\.spec\.\w+$/,
];

// ─── URL parsing ───────────────────────────────────────────────

export interface ParsedURL {
  owner: string;
  repo: string;
  branch?: string;
  subdirectory?: string;
}

/**
 * Parse a GitHub URL (or shorthand) into its components.
 *
 * Supported formats:
 *  - `https://github.com/owner/repo`
 *  - `https://github.com/owner/repo/tree/branch`
 *  - `https://github.com/owner/repo/tree/branch/sub/dir`
 *  - `github.com/owner/repo`
 *  - `owner/repo`
 */
export function parseGitHubURL(input: string): ParsedURL {
  let cleaned = input.trim();

  // Strip protocol + optional www
  cleaned = cleaned
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');

  // Strip leading github.com/
  cleaned = cleaned.replace(/^github\.com\//, '');

  // Remove trailing slash
  cleaned = cleaned.replace(/\/+$/, '');

  const parts = cleaned.split('/');

  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new RepoNotFoundError(parts[0] ?? '', parts[1] ?? '');
  }

  const owner = parts[0];
  const repo = parts[1];

  // No /tree/ segment → no branch specified
  if (parts.length === 2) {
    return { owner, repo };
  }

  // parts[2] should be 'tree'
  if (parts[2] === 'tree' && parts.length >= 4) {
    const branch = parts[3];
    const subdirectory = parts.length > 4 ? parts.slice(4).join('/') : undefined;
    return { owner, repo, branch, subdirectory };
  }

  // Could be owner/repo/something else – treat as repo with no branch
  return { owner, repo };
}

// ─── Semaphore for concurrency limiting ────────────────────────

class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private readonly concurrency: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

function isBinary(path: string): boolean {
  return BINARY_EXTENSIONS.has(extensionOf(path));
}

function shouldSkip(
  path: string,
  extraExclude?: string[],
): boolean {
  for (const dir of DEFAULT_SKIP_DIRS) {
    if (path.startsWith(dir) || path.includes(`/${dir}`)) return true;
  }
  for (const file of DEFAULT_SKIP_FILES) {
    if (path === file) return true;
  }
  for (const pattern of DEFAULT_SKIP_PATTERNS) {
    if (pattern.test(path)) return true;
  }
  if (extraExclude) {
    for (const ex of extraExclude) {
      if (path.includes(ex)) return true;
    }
  }
  return false;
}

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  return headers;
}

// ─── Main resolver ─────────────────────────────────────────────

export interface ResolverOptions {
  githubToken?: string;
  maxConcurrentFetches?: number;
  exclude?: string[];
  /** Override branch (takes priority over the URL-parsed branch). */
  branch?: string;
  /** Subdirectory within the repo. */
  subdirectory?: string;
}

/**
 * Fetch all project files from a GitHub repository.
 */
export async function resolveProject(
  urlOrShorthand: string,
  options: ResolverOptions = {},
): Promise<ResolvedProject> {
  const parsed = parseGitHubURL(urlOrShorthand);
  const { owner, repo } = parsed;
  const branch = options.branch ?? parsed.branch;
  const subdirectory = options.subdirectory ?? parsed.subdirectory;
  const token = options.githubToken;
  const concurrency = options.maxConcurrentFetches ?? 6;

  // 1) Resolve default branch if not provided
  const resolvedBranch = branch ?? (await resolveDefaultBranch(owner, repo, token));

  // 2) Fetch tree (always — needed for cache SHA comparison)
  const tree = await fetchTree(owner, repo, resolvedBranch, token);

  // 3) Filter paths
  let paths = tree.paths.filter((p) => !shouldSkip(p, options.exclude));

  // If subdirectory specified, scope down and rewrite paths
  if (subdirectory) {
    const prefix = subdirectory.endsWith('/') ? subdirectory : `${subdirectory}/`;
    paths = paths
      .filter((p) => p.startsWith(prefix))
      .map((p) => p.slice(prefix.length));
  }

  // 4) Fetch file contents in parallel
  const sem = new Semaphore(concurrency);
  const files = new Map<string, string>();
  const binaryFiles = new Map<string, Blob>();

  const fetchJobs = paths.map(async (relativePath) => {
    await sem.acquire();
    try {
      const rawPath = subdirectory
        ? `${subdirectory}/${relativePath}`
        : relativePath;
      const url = `${RAW_BASE}/${owner}/${repo}/${resolvedBranch}/${rawPath}`;

      if (isBinary(relativePath)) {
        const res = await fetch(url);
        if (!res.ok) return; // skip missing files silently
        const blob = await res.blob();
        binaryFiles.set(relativePath, blob);
      } else {
        const res = await fetch(url);
        if (!res.ok) return;
        const text = await res.text();
        files.set(relativePath, text);
      }
    } catch {
      // Skip individual file failures — don't abort the whole resolve
    } finally {
      sem.release();
    }
  });

  await Promise.all(fetchJobs);

  return {
    owner,
    repo,
    branch: resolvedBranch,
    sha: tree.sha,
    files,
    binaryFiles,
  };
}

// ─── GitHub API helpers ────────────────────────────────────────

async function resolveDefaultBranch(
  owner: string,
  repo: string,
  token?: string,
): Promise<string> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}`;
  const res = await safeFetch(url, authHeaders(token));

  if (res.status === 404) {
    throw new RepoNotFoundError(owner, repo);
  }
  handleRateLimit(res);
  if (!res.ok) {
    throw new NetworkError(`GitHub API returned ${res.status} for ${url}`);
  }

  const data = (await res.json()) as { default_branch: string };
  return data.default_branch;
}

interface TreeResponse {
  sha: string;
  paths: string[];
}

async function fetchTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
): Promise<TreeResponse> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const res = await safeFetch(url, authHeaders(token));

  if (res.status === 404) {
    throw new BranchNotFoundError(owner, repo, branch);
  }
  handleRateLimit(res);
  if (!res.ok) {
    throw new NetworkError(`GitHub API returned ${res.status} fetching tree for ${owner}/${repo}`);
  }

  const data = (await res.json()) as {
    sha: string;
    tree: Array<{ path: string; type: string }>;
  };

  const paths = data.tree
    .filter((entry) => entry.type === 'blob')
    .map((entry) => entry.path);

  return { sha: data.sha, paths };
}

function handleRateLimit(res: Response): void {
  if (res.status === 403 || res.status === 429) {
    const resetHeader = res.headers.get('x-ratelimit-reset');
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining === '0' || res.status === 429) {
      throw new RateLimitError(
        resetHeader ? parseInt(resetHeader, 10) : undefined,
      );
    }
  }
}

async function safeFetch(
  url: string,
  headers: Record<string, string>,
): Promise<Response> {
  try {
    return await fetch(url, { headers });
  } catch (err) {
    throw new NetworkError(
      `Network request failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
