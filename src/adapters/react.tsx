import {
  useRef,
  useEffect,
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type MutableRefObject,
} from 'react';
import { Diorama as DioramaCore } from '../index';
import type {
  DioramaOptions,
  DioramaInstance,
  LoadingStrategy,
  FrameStyle,
} from '../types';
import type { DioramaError } from '../errors';

// ─── Props ─────────────────────────────────────────────────────

export interface DioramaProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onLoad' | 'onError'> {
  /** GitHub URL or `owner/repo` shorthand. */
  repo: string;
  /** Branch to render. */
  branch?: string;
  /** Subdirectory within the repo. */
  subdirectory?: string;
  /** Loading strategy. Default: `'eager'`. */
  loading?: LoadingStrategy;
  /** Placeholder image for click/viewport loading. */
  placeholder?: string;
  /** CSS height of the iframe. Default: `'500px'`. */
  height?: string;
  /** Decorative frame style. Default: `'none'`. */
  frame?: FrameStyle;
  /** Allow click-to-expand to fill viewport. Default: `false`. */
  expand?: boolean;
  /** Called when rendering completes. */
  onLoad?: () => void;
  /** Called on error. */
  onError?: (error: DioramaError) => void;
  /** Additional Diorama constructor options. */
  options?: DioramaOptions;
}

// Re-export the core class for advanced usage
export { DioramaCore as Diorama };

// Shared instance (avoids re-creating on every component mount)
let sharedInstance: DioramaCore | null = null;

function getOrCreateInstance(options?: DioramaOptions): DioramaCore {
  if (!sharedInstance) {
    sharedInstance = new DioramaCore(options);
  }
  return sharedInstance;
}

// ─── Component ─────────────────────────────────────────────────

/**
 * React component that renders a GitHub project in a sandboxed iframe.
 *
 * ```tsx
 * <DioramaPreview repo="user/repo" height="500px" loading="click" />
 * ```
 */
export const DioramaPreview = forwardRef<HTMLDivElement, DioramaProps>(
  function DioramaPreview(
    {
      repo,
      branch,
      subdirectory,
      loading = 'eager',
      placeholder,
      height = '500px',
      frame,
      expand,
      onLoad,
      onError,
      options,
      style,
      ...divProps
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<DioramaInstance | null>(null);

    // Merge refs
    const setRefs = (el: HTMLDivElement | null) => {
      containerRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as MutableRefObject<HTMLDivElement | null>).current = el;
    };

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const diorama = getOrCreateInstance(options);

      let cancelled = false;

      diorama
        .render(container, repo, {
          branch,
          subdirectory,
          loading: loading as LoadingStrategy,
          placeholder,
          height,
          frame,
          expand,
          onLoad,
          onError: (err) => {
            onError?.(err);
          },
        })
        .then((inst) => {
          if (cancelled) {
            inst.destroy();
          } else {
            instanceRef.current = inst;
          }
        })
        .catch((err) => {
          if (!cancelled) {
            onError?.(err);
          }
        });

      return () => {
        cancelled = true;
        instanceRef.current?.destroy();
        instanceRef.current = null;
      };
    }, [repo, branch, subdirectory, loading, placeholder, height, frame, expand]);

    const containerStyle: CSSProperties = {
      width: '100%',
      minHeight: height,
      ...style,
    };

    return <div ref={setRefs} style={containerStyle} {...divProps} />;
  },
);
