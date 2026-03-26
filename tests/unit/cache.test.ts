import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheManager } from '../../src/core/cache';
import type { ResolvedProject } from '../../src/types';

function createMockProject(overrides: Partial<ResolvedProject> = {}): ResolvedProject {
  return {
    owner: 'octocat',
    repo: 'hello-world',
    branch: 'main',
    sha: 'abc123',
    files: new Map([['index.html', '<h1>Hello</h1>']]),
    binaryFiles: new Map(),
    ...overrides,
  };
}

describe('CacheManager', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => { storage[key] = value; },
      removeItem: (key: string) => { delete storage[key]; },
    });
  });

  it('returns null when caching is disabled', async () => {
    const cache = new CacheManager({ enabled: false });
    const project = createMockProject();
    await cache.set(project);
    expect(cache.get('octocat', 'hello-world', 'abc123')).toBeNull();
  });

  it('stores and retrieves a project', async () => {
    const cache = new CacheManager({ enabled: true, ttl: 3600 });
    const project = createMockProject();

    await cache.set(project);

    const result = cache.get('octocat', 'hello-world', 'abc123');
    expect(result).not.toBeNull();
    expect(result!.owner).toBe('octocat');
    expect(result!.repo).toBe('hello-world');
    expect(result!.sha).toBe('abc123');
    expect(result!.files.get('index.html')).toBe('<h1>Hello</h1>');
  });

  it('returns null for SHA mismatch', async () => {
    const cache = new CacheManager({ enabled: true });
    const project = createMockProject();
    await cache.set(project);

    const result = cache.get('octocat', 'hello-world', 'different-sha');
    expect(result).toBeNull();
  });

  it('returns null for expired entries', async () => {
    const cache = new CacheManager({ enabled: true, ttl: 0 }); // 0 seconds = immediate expiry
    const project = createMockProject();
    await cache.set(project);

    // Wait a tick so Date.now() advances
    await new Promise((r) => setTimeout(r, 10));

    const result = cache.get('octocat', 'hello-world', 'abc123');
    expect(result).toBeNull();
  });

  it('clears cache for a specific repo', async () => {
    const cache = new CacheManager({ enabled: true });
    await cache.set(createMockProject());
    await cache.set(createMockProject({ owner: 'other', repo: 'project', sha: 'def456' }));

    cache.clear('octocat/hello-world');

    expect(cache.get('octocat', 'hello-world', 'abc123')).toBeNull();
    // The other project should still be cached
    expect(cache.get('other', 'project', 'def456')).not.toBeNull();
  });

  it('clears all cache entries', async () => {
    const cache = new CacheManager({ enabled: true });
    await cache.set(createMockProject());
    await cache.set(createMockProject({ owner: 'other', repo: 'project', sha: 'def456' }));

    cache.clear();

    expect(cache.get('octocat', 'hello-world', 'abc123')).toBeNull();
    expect(cache.get('other', 'project', 'def456')).toBeNull();
  });
});
