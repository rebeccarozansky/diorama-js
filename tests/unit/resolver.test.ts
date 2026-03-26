import { describe, it, expect } from 'vitest';
import { parseGitHubURL } from '../../src/core/resolver';

describe('parseGitHubURL', () => {
  it('parses full URL: https://github.com/owner/repo', () => {
    const result = parseGitHubURL('https://github.com/octocat/hello-world');
    expect(result).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
    });
  });

  it('parses URL with branch: /tree/main', () => {
    const result = parseGitHubURL('https://github.com/octocat/hello-world/tree/main');
    expect(result).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
      branch: 'main',
    });
  });

  it('parses URL with branch and subdirectory', () => {
    const result = parseGitHubURL(
      'https://github.com/octocat/hello-world/tree/develop/packages/demo',
    );
    expect(result).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
      branch: 'develop',
      subdirectory: 'packages/demo',
    });
  });

  it('parses shorthand without protocol: github.com/owner/repo', () => {
    const result = parseGitHubURL('github.com/octocat/hello-world');
    expect(result).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
    });
  });

  it('parses minimal shorthand: owner/repo', () => {
    const result = parseGitHubURL('octocat/hello-world');
    expect(result).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
    });
  });

  it('strips trailing slash', () => {
    const result = parseGitHubURL('https://github.com/octocat/hello-world/');
    expect(result).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
    });
  });

  it('handles http:// protocol', () => {
    const result = parseGitHubURL('http://github.com/octocat/hello-world');
    expect(result).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
    });
  });

  it('handles www.github.com', () => {
    const result = parseGitHubURL('https://www.github.com/octocat/hello-world');
    expect(result).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
    });
  });

  it('throws for invalid URL with no repo', () => {
    expect(() => parseGitHubURL('octocat')).toThrow();
  });

  it('handles deep subdirectory path', () => {
    const result = parseGitHubURL(
      'https://github.com/owner/repo/tree/main/src/components/ui',
    );
    expect(result).toEqual({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      subdirectory: 'src/components/ui',
    });
  });
});
