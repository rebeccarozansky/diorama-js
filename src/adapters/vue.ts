/**
 * Diorama Vue adapter.
 *
 * Provides a Vue 3 Composition API component for rendering
 * GitHub projects in a sandboxed iframe.
 *
 * ```vue
 * <template>
 *   <DioramaPreview repo="user/repo" height="500px" loading="click" />
 * </template>
 *
 * <script setup>
 * import { DioramaPreview } from 'diorama/vue';
 * </script>
 * ```
 */
import {
  defineComponent,
  ref,
  onMounted,
  onUnmounted,
  watch,
  h,
  type PropType,
  type ExtractPropTypes,
} from 'vue';
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

const dioramaProps = {
  repo: { type: String, required: true as const },
  branch: { type: String, default: undefined },
  subdirectory: { type: String, default: undefined },
  loading: { type: String as PropType<LoadingStrategy>, default: 'eager' as const },
  placeholder: { type: String, default: undefined },
  height: { type: String, default: '500px' },
  frame: { type: String as PropType<FrameStyle>, default: 'none' as const },
  expand: { type: Boolean, default: false },
  tailwind: { type: [String, Boolean] as PropType<'auto' | boolean>, default: 'auto' as const },
  options: { type: Object as PropType<DioramaOptions>, default: undefined },
};

type DioramaPropsType = ExtractPropTypes<typeof dioramaProps>;

export const DioramaPreview = defineComponent({
  name: 'DioramaPreview',

  props: dioramaProps,

  emits: ['load', 'error'],

  setup(props: DioramaPropsType, { emit }: { emit: (event: 'load' | 'error', ...args: unknown[]) => void }) {
    const containerRef = ref<HTMLElement | null>(null);
    let instance: DioramaInstance | null = null;

    async function renderProject() {
      const container = containerRef.value;
      if (!container) return;

      // Destroy previous instance
      instance?.destroy();
      instance = null;

      const diorama = getOrCreateInstance(props.options);

      try {
        instance = await diorama.render(container, props.repo, {
          branch: props.branch,
          subdirectory: props.subdirectory,
          loading: props.loading,
          placeholder: props.placeholder,
          height: props.height,
          frame: props.frame,
          expand: props.expand,
          tailwind: props.tailwind,
          onLoad: () => emit('load'),
          onError: (err: DioramaError) => emit('error', err),
        });
      } catch (err) {
        emit('error', err);
      }
    }

    onMounted(() => {
      renderProject();
    });

    onUnmounted(() => {
      instance?.destroy();
      instance = null;
    });

    // Re-render on prop changes
    watch(
      () => [props.repo, props.branch, props.subdirectory, props.loading, props.height, props.frame, props.expand, props.tailwind],
      () => {
        renderProject();
      },
    );

    return () =>
      h('div', {
        ref: containerRef,
        style: { width: '100%', minHeight: props.height },
      });
  },
});
