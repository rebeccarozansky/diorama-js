/**
 * Base error class for all Diorama errors.
 * Every error has a `code` property for programmatic handling.
 */
export class DioramaError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DioramaError';
    this.code = code;
    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** GitHub returns 404 for the repository. */
export class RepoNotFoundError extends DioramaError {
  constructor(owner: string, repo: string) {
    super(
      'REPO_NOT_FOUND',
      `Repository ${owner}/${repo} not found. Make sure it's a public repository.`,
    );
    this.name = 'RepoNotFoundError';
  }
}

/** The specified branch doesn't exist. */
export class BranchNotFoundError extends DioramaError {
  constructor(owner: string, repo: string, branch: string) {
    super(
      'BRANCH_NOT_FOUND',
      `Branch '${branch}' not found in ${owner}/${repo}.`,
    );
    this.name = 'BranchNotFoundError';
  }
}

/** GitHub API rate limit exceeded. */
export class RateLimitError extends DioramaError {
  public readonly resetAt: Date | null;

  constructor(resetTimestamp?: number) {
    const resetAt = resetTimestamp ? new Date(resetTimestamp * 1000) : null;
    const resetMsg = resetAt
      ? ` Wait until ${resetAt.toLocaleTimeString()} or pass a GitHub token to increase the limit.`
      : ' Pass a GitHub token to increase the limit, or wait and try again.';
    super('RATE_LIMIT', `GitHub API rate limit exceeded.${resetMsg}`);
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

/** Fetch failures, CORS issues, timeouts. */
export class NetworkError extends DioramaError {
  constructor(message = 'A network error occurred. Check your connection and try again.') {
    super('NETWORK_ERROR', message);
    this.name = 'NetworkError';
  }
}

/** Can't detect a supported project type. */
export class ProjectTypeError extends DioramaError {
  constructor(message = 'Could not detect a supported project type. Diorama supports static HTML, ESM, React, Preact, and TypeScript projects.') {
    super('UNSUPPORTED_PROJECT', message);
    this.name = 'ProjectTypeError';
  }
}

/** Project imports a Node.js built-in module. */
export class NodeBuiltinError extends DioramaError {
  public readonly moduleName: string;

  constructor(moduleName: string) {
    super(
      'NODE_BUILTIN',
      `This project imports '${moduleName}' which is a Node.js built-in. Diorama only supports browser-compatible projects.`,
    );
    this.name = 'NodeBuiltinError';
    this.moduleName = moduleName;
  }
}

/** esbuild reports a syntax error during transpilation. */
export class TranspileError extends DioramaError {
  public readonly file: string;
  public readonly line?: number;
  public readonly column?: number;

  constructor(message: string, file: string, line?: number, column?: number) {
    super('TRANSPILE_FAILED', message);
    this.name = 'TranspileError';
    this.file = file;
    this.line = line;
    this.column = column;
  }
}

/** esbuild-wasm binary fails to download or initialize. */
export class TranspilerLoadError extends DioramaError {
  constructor(message = 'Failed to load the transpiler. Check your network connection.') {
    super('TRANSPILER_LOAD_FAILED', message);
    this.name = 'TranspilerLoadError';
  }
}

/** HTML assembly hits an unresolvable state. */
export class AssemblyError extends DioramaError {
  constructor(message: string) {
    super('ASSEMBLY_FAILED', message);
    this.name = 'AssemblyError';
  }
}

/** A dependency can't be resolved on the CDN. */
export class PackageNotFoundError extends DioramaError {
  public readonly packageName: string;

  constructor(packageName: string) {
    super(
      'PACKAGE_NOT_FOUND',
      `Package '${packageName}' could not be resolved on the CDN.`,
    );
    this.name = 'PackageNotFoundError';
    this.packageName = packageName;
  }
}

/** No index.html or JS entry point found. */
export class EntryPointError extends DioramaError {
  constructor(message = 'No entry point found. Diorama looks for index.html, src/index.jsx, src/index.tsx, or src/index.js.') {
    super('NO_ENTRY_POINT', message);
    this.name = 'EntryPointError';
  }
}
