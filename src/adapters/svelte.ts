/**
 * Diorama Svelte adapter.
 *
 * Since Svelte 4+ supports plain JS/TS components via actions,
 * this adapter provides a Svelte-friendly wrapper using a simple
 * action function and a component factory.
 *
 * Usage:
 * ```svelte
 * <script>
 *   import { dioramaAction } from 'diorama/svelte';
 * </script>
 *
 * <div use:dioramaAction={{ repo: 'user/repo', height: '500px' }} />
 * ```
 */
import { Diorama as DioramaCore } from '../index';
import type {
  DioramaOptions,
  DioramaInstance,
  LoadingStrategy,
  FrameStyle,
} from '../types';
import type { DioramaError } from '../errors';

// Re-export core for advanced usage
export { DioramaCore as Diorama };

// Shared instance
let sharedInstance: DioramaCore | null = null;

function getOrCreateInstance(options?: DioramaOptions): DioramaCore {
  if (!sharedInstance) {
    sharedInstance = new DioramaCore(options);
  }
  return sharedInstance;
}

// ─── Types ─────────────────────────────────────────────────────

export interface DioramaActionOptions {
  repo: string;
  branch?: string;
  subdirectory?: string;
  loading?: LoadingStrategy;
  placeholder?: string;
  height?: string;
  /** Decorative frame style. Default: `'none'`. */
  frame?: FrameStyle;
  /** Allow click-to-expand to fill viewport. Default: `false`. */
  expand?: boolean;
  onLoad?: () => void;
  onError?: (error: DioramaError) => void;
  options?: DioramaOptions;
}

// ─── Svelte action ─────────────────────────────────────────────

/**
 * Svelte action that renders a GitHub project in the target element.
 *
 * ```svelte
 * <div use:dioramaAction={{ repo: 'user/repo' }} />
 * ```
 */
export function dioramaAction(
  node: HTMLElement,
  params: DioramaActionOptions,
) {
  let instance: DioramaInstance | null = null;

  async function render(opts: DioramaActionOptions) {
    instance?.destroy();
    instance = null;

    const diorama = getOrCreateInstance(opts.options);

    try {
      instance = await diorama.render(node, opts.repo, {
        branch: opts.branch,
        subdirectory: opts.subdirectory,
        loading: opts.loading ?? 'eager',
        placeholder: opts.placeholder,
        height: opts.height ?? '500px',
        frame: opts.frame,
        expand: opts.expand,
        onLoad: opts.onLoad,
        onError: opts.onError,
      });
    } catch (err) {
      opts.onError?.(err as DioramaError);
    }
  }

  render(params);

  return {
    update(newParams: DioramaActionOptions) {
      render(newParams);
    },
    destroy() {
      instance?.destroy();
      instance = null;
    },
  };
}
