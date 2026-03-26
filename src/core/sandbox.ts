import type { DioramaError } from '../errors';
import type { FrameStyle, LoadingStrategy } from '../types';

// ─── Types ─────────────────────────────────────────────────────

export interface SandboxOptions {
  /** CSS selector or DOM element to render into. */
  container: string | HTMLElement;
  /** Assembled HTML string. */
  html: string;
  /** CSS height for the iframe. Default: `'500px'`. */
  height?: string;
  /** Iframe sandbox flags. Default: `['allow-scripts']`. */
  sandboxFlags?: string[];
  /** Loading strategy. Default: `'eager'`. */
  loading?: LoadingStrategy;
  /** Decorative frame style wrapping the iframe. Default: `'none'`. */
  frame?: FrameStyle;
  /** Enable click-to-expand fullscreen lightbox. Default: `false`. */
  expand?: boolean;
  /** Placeholder image URL for click/viewport loading. */
  placeholder?: string;
  /** Repository display name (used in default placeholder card). */
  repoName?: string;
  /** Whether the project uses ES modules (use Blob URL instead of srcdoc). */
  useBlobURL?: boolean;
  /** Called when the iframe has loaded. */
  onLoad?: () => void;
  /** Called on error. */
  onError?: (error: DioramaError) => void;
}

export interface SandboxInstance {
  /** Remove iframe, revoke Blob URLs, detach observers. */
  destroy(): void;
  /** Replace content with new HTML and re-render. */
  update(html: string): void;
}

// ─── Error HTML template ───────────────────────────────────────

export function buildErrorHTML(message: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fef2f2;">
  <div style="max-width:540px;padding:32px;text-align:center;">
    <h2 style="margin:0 0 12px;color:#dc2626;font-size:20px;">Diorama: Render error</h2>
    <p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.5;">${escapeHTML(message)}</p>
    <p style="margin:0;color:#888;font-size:13px;">
      This project may use features not supported by Diorama.
      <a href="https://github.com/becca/diorama#supported-projects" target="_blank" rel="noopener" style="color:#2563eb;">Learn more</a>
    </p>
  </div>
</body>
</html>`;
}

// ─── Sandbox Manager ───────────────────────────────────────────

/**
 * Create a sandboxed iframe and inject the assembled HTML.
 * Returns a handle for cleanup / updates.
 */
export function createSandbox(options: SandboxOptions): SandboxInstance {
  const {
    container,
    html,
    height = '500px',
    sandboxFlags = ['allow-scripts'],
    loading = 'eager',
    frame = 'none',
    expand = false,
    placeholder,
    repoName,
    useBlobURL = false,
    onLoad,
    onError,
  } = options;

  // Resolve container element
  const maybeEl =
    typeof container === 'string'
      ? document.querySelector<HTMLElement>(container)
      : container;

  if (!maybeEl) {
    throw new Error(
      `Diorama: container "${typeof container === 'string' ? container : 'element'}" not found in the DOM.`,
    );
  }

  // Guaranteed non-null after the check above
  const el: HTMLElement = maybeEl;

  // State
  let blobURL: string | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let observer: IntersectionObserver | null = null;
  let destroyed = false;

  // Expand state
  let isExpanded = false;
  let backdrop: HTMLElement | null = null;
  let expandBtn: HTMLButtonElement | null = null;
  let expandEscHandler: ((e: KeyboardEvent) => void) | null = null;

  // ─── Build the iframe ──────────────────────────────────────

  function buildIframe(content: string): HTMLIFrameElement {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', sandboxFlags.join(' '));
    frame.setAttribute('loading', 'lazy');
    frame.setAttribute('aria-label', repoName ? `Preview of ${repoName}` : 'Diorama project preview');
    frame.style.width = '100%';
    frame.style.height = height;
    frame.style.border = 'none';
    frame.style.display = 'block';

    if (useBlobURL) {
      const blob = new Blob([content], { type: 'text/html' });
      blobURL = URL.createObjectURL(blob);
      frame.src = blobURL;
    } else {
      frame.srcdoc = content;
    }

    frame.addEventListener('load', () => {
      onLoad?.();
    });

    return frame;
  }

  // ─── Placeholder ───────────────────────────────────────────

  function buildPlaceholder(onClick: () => void): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.height = height;
    wrapper.style.cursor = 'pointer';
    wrapper.style.overflow = 'hidden';
    wrapper.style.borderRadius = '8px';
    wrapper.style.background = '#f3f4f6';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute('tabindex', '0');
    wrapper.setAttribute('aria-label', 'Launch project preview');

    if (placeholder) {
      const img = document.createElement('img');
      img.src = placeholder;
      img.alt = repoName ? `Preview of ${repoName}` : 'Project preview';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      wrapper.appendChild(img);
    }

    // Overlay play button
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = placeholder ? 'rgba(0,0,0,0.35)' : 'transparent';

    const playBtn = document.createElement('div');
    playBtn.innerHTML = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="24" fill="rgba(0,0,0,0.5)"/><polygon points="19,14 19,34 36,24" fill="white"/></svg>`;
    overlay.appendChild(playBtn);

    if (repoName && !placeholder) {
      const label = document.createElement('div');
      label.textContent = repoName;
      label.style.marginTop = '12px';
      label.style.fontSize = '15px';
      label.style.fontFamily = 'system-ui, sans-serif';
      label.style.color = '#374151';
      label.style.fontWeight = '500';
      overlay.appendChild(label);
    }

    const hint = document.createElement('div');
    hint.textContent = 'Click to launch preview';
    hint.style.marginTop = '8px';
    hint.style.fontSize = '13px';
    hint.style.fontFamily = 'system-ui, sans-serif';
    hint.style.color = placeholder ? 'rgba(255,255,255,0.85)' : '#6b7280';
    overlay.appendChild(hint);

    wrapper.appendChild(overlay);

    wrapper.addEventListener('click', onClick);
    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    });

    return wrapper;
  }

  // ─── Loading strategies ────────────────────────────────────

  function renderIframe(content: string): void {
    if (destroyed) return;
    el.innerHTML = '';
    iframe = buildIframe(content);

    if (frame !== 'none') {
      const wrapper = buildFrame(iframe, frame, repoName);
      el.appendChild(wrapper);
    } else {
      el.appendChild(iframe);
    }

    if (expand) attachExpandButton();
  }

  function setupEager(): void {
    renderIframe(html);
  }

  function setupClick(): void {
    const placeholderEl = buildPlaceholder(() => {
      renderIframe(html);
    });
    el.innerHTML = '';
    el.appendChild(placeholderEl);
  }

  function setupViewport(): void {
    // Show placeholder immediately
    const placeholderEl = buildPlaceholder(() => {
      renderIframe(html);
      observer?.disconnect();
      observer = null;
    });
    el.innerHTML = '';
    el.appendChild(placeholderEl);

    // Also auto-trigger when scrolled into view
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            renderIframe(html);
            observer?.disconnect();
            observer = null;
            break;
          }
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
  }

  // ─── Expand ────────────────────────────────────────────────

  function expandDiorama(): void {
    if (isExpanded || destroyed) return;
    isExpanded = true;
    injectExpandStyles();

    backdrop = document.createElement('div');
    backdrop.className = 'diorama-expand-backdrop';
    backdrop.setAttribute('aria-label', 'Close expanded preview');
    backdrop.addEventListener('click', collapseDiorama);
    document.body.appendChild(backdrop);

    el.classList.add('diorama-expanded');

    expandEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapseDiorama();
    };
    document.addEventListener('keydown', expandEscHandler);
  }

  function collapseDiorama(): void {
    if (!isExpanded) return;
    isExpanded = false;

    backdrop?.remove();
    backdrop = null;

    el.classList.remove('diorama-expanded');

    if (expandEscHandler) {
      document.removeEventListener('keydown', expandEscHandler);
      expandEscHandler = null;
    }
  }

  function attachExpandButton(): void {
    injectExpandStyles();
    el.classList.add('diorama-expandable');

    expandBtn?.remove();
    expandBtn = document.createElement('button');
    expandBtn.className = 'diorama-expand-btn';
    expandBtn.setAttribute('aria-label', 'Expand preview');
    expandBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="10,2 14,2 14,6"/><polyline points="6,14 2,14 2,10"/><line x1="14" y1="2" x2="9" y2="7"/><line x1="2" y1="14" x2="7" y2="9"/></svg>';
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!isExpanded) expandDiorama();
    });
    el.appendChild(expandBtn);
  }

  // ─── Init ──────────────────────────────────────────────────

  try {
    switch (loading) {
      case 'click':
        setupClick();
        break;
      case 'viewport':
        setupViewport();
        break;
      case 'eager':
      default:
        setupEager();
        break;
    }
  } catch (err) {
    onError?.(err as DioramaError);
  }

  // ─── Instance ──────────────────────────────────────────────

  return {
    destroy() {
      destroyed = true;
      collapseDiorama();
      expandBtn?.remove();
      expandBtn = null;
      if (blobURL) {
        URL.revokeObjectURL(blobURL);
        blobURL = null;
      }
      observer?.disconnect();
      observer = null;
      el.innerHTML = '';
      iframe = null;
    },

    update(newHTML: string) {
      if (destroyed) return;
      if (blobURL) {
        URL.revokeObjectURL(blobURL);
        blobURL = null;
      }
      if (iframe) {
        if (useBlobURL) {
          const blob = new Blob([newHTML], { type: 'text/html' });
          blobURL = URL.createObjectURL(blob);
          iframe.src = blobURL;
        } else {
          iframe.srcdoc = newHTML;
        }
      } else {
        // Iframe hasn't been created yet (click/viewport), render now
        renderIframe(newHTML);
      }
    },
  };
}

// ─── Frame builder ─────────────────────────────────────────────

/**
 * Wrap an iframe element inside a decorative frame.
 * Returns the outer wrapper element with the iframe already appended.
 */
function buildFrame(
  iframe: HTMLIFrameElement,
  style: Exclude<FrameStyle, 'none'>,
  repoName?: string,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = `diorama-frame diorama-frame--${style}`;

  // Inject scoped styles (idempotent — only once per page)
  injectFrameStyles();

  switch (style) {
    case 'polaroid':
      return buildPolaroidFrame(wrapper, iframe, repoName);
    case 'museum':
      return buildMuseumFrame(wrapper, iframe);
    case 'standard':
      return buildStandardFrame(wrapper, iframe);
    case 'terminal':
      return buildTerminalFrame(wrapper, iframe, repoName);
    case 'postcard':
      return buildPostcardFrame(wrapper, iframe, repoName);
    case 'blueprint':
      return buildBlueprintFrame(wrapper, iframe, repoName);
    case 'browser':
      return buildBrowserFrame(wrapper, iframe, repoName);
    default:
      wrapper.appendChild(iframe);
      return wrapper;
  }
}

// ── Polaroid ────────────────────────────────────────────────────

function buildPolaroidFrame(
  wrapper: HTMLElement,
  iframe: HTMLIFrameElement,
  repoName?: string,
): HTMLElement {
  wrapper.appendChild(iframe);
  const caption = document.createElement('div');
  caption.className = 'diorama-polaroid-caption';
  caption.textContent = repoName || '';
  wrapper.appendChild(caption);
  return wrapper;
}

// ── Museum ──────────────────────────────────────────────────────

function buildMuseumFrame(
  wrapper: HTMLElement,
  iframe: HTMLIFrameElement,
): HTMLElement {
  // Inner mat
  const mat = document.createElement('div');
  mat.className = 'diorama-museum-mat';
  mat.appendChild(iframe);
  wrapper.appendChild(mat);
  return wrapper;
}

// ── Standard ────────────────────────────────────────────────────

function buildStandardFrame(
  wrapper: HTMLElement,
  iframe: HTMLIFrameElement,
): HTMLElement {
  wrapper.appendChild(iframe);
  return wrapper;
}

// ── Terminal ────────────────────────────────────────────────────

function buildTerminalFrame(
  wrapper: HTMLElement,
  iframe: HTMLIFrameElement,
  repoName?: string,
): HTMLElement {
  const titlebar = document.createElement('div');
  titlebar.className = 'diorama-terminal-bar';

  const dots = document.createElement('div');
  dots.className = 'diorama-terminal-dots';
  dots.innerHTML = '<i></i><i></i><i></i>';
  titlebar.appendChild(dots);

  const title = document.createElement('span');
  title.className = 'diorama-terminal-title';
  title.textContent = repoName || 'diorama';
  titlebar.appendChild(title);

  wrapper.appendChild(titlebar);
  wrapper.appendChild(iframe);
  return wrapper;
}

// ── Postcard ────────────────────────────────────────────────────

function buildPostcardFrame(
  wrapper: HTMLElement,
  iframe: HTMLIFrameElement,
  repoName?: string,
): HTMLElement {
  wrapper.appendChild(iframe);

  const stamp = document.createElement('div');
  stamp.className = 'diorama-postcard-stamp';
  stamp.innerHTML = `<span class="diorama-postcard-stamp-text">📮</span>`;
  wrapper.appendChild(stamp);

  const postmark = document.createElement('div');
  postmark.className = 'diorama-postcard-mark';
  postmark.textContent = repoName || 'DIORAMA';
  wrapper.appendChild(postmark);

  return wrapper;
}

// ── Blueprint ───────────────────────────────────────────────────

function buildBlueprintFrame(
  wrapper: HTMLElement,
  iframe: HTMLIFrameElement,
  repoName?: string,
): HTMLElement {
  wrapper.appendChild(iframe);

  const label = document.createElement('div');
  label.className = 'diorama-blueprint-label';
  label.textContent = repoName ? `DRAWING: ${repoName.toUpperCase()}` : 'DRAWING: UNTITLED';
  wrapper.appendChild(label);

  return wrapper;
}

// ── Browser ─────────────────────────────────────────────────────

function buildBrowserFrame(
  wrapper: HTMLElement,
  iframe: HTMLIFrameElement,
  repoName?: string,
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'diorama-browser-bar';

  const dots = document.createElement('div');
  dots.className = 'diorama-browser-dots';
  dots.innerHTML = '<i></i><i></i><i></i>';
  bar.appendChild(dots);

  const url = document.createElement('div');
  url.className = 'diorama-browser-url';
  url.textContent = repoName
    ? `https://${repoName.replace(/\//g, '.').toLowerCase()}.github.io`
    : 'https://example.github.io';
  bar.appendChild(url);

  wrapper.appendChild(bar);
  wrapper.appendChild(iframe);
  return wrapper;
}

// ─── Frame CSS injection ───────────────────────────────────────

let stylesInjected = false;

function injectFrameStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const css = `
/* ── Diorama Frame Styles ──────────────────────────────── */

.diorama-frame {
  position: relative;
  display: inline-block;
  width: 100%;
  box-sizing: border-box;
}
.diorama-frame iframe {
  display: block;
  width: 100%;
}

/* ── Standard ─────────────────────────────────────────── */
.diorama-frame--standard {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  overflow: hidden;
  box-shadow:
    0 1px 3px rgba(0,0,0,.06),
    0 4px 12px rgba(0,0,0,.04);
}

/* ── Polaroid ─────────────────────────────────────────── */
.diorama-frame--polaroid {
  background: #fff;
  padding: 12px 12px 0 12px;
  border-radius: 2px;
  box-shadow:
    0 2px 8px rgba(0,0,0,.10),
    0 8px 30px rgba(0,0,0,.08);
  transform: rotate(-1.2deg);
}
.diorama-frame--polaroid iframe {
  border-radius: 0;
}
.diorama-polaroid-caption {
  padding: 16px 4px 20px;
  text-align: center;
  font-family: 'Caveat', 'Segoe Print', 'Comic Sans MS', cursive;
  font-size: 1.05rem;
  color: #4b5563;
  letter-spacing: .3px;
  min-height: 24px;
}

/* ── Museum ───────────────────────────────────────────── */
.diorama-frame--museum {
  --gold-light: #e8c96e;
  --gold-mid: #c9a23a;
  --gold-dark: #9e7a22;
  --gold-shadow: #7a5c18;

  padding: 18px;
  background:
    linear-gradient(145deg, var(--gold-light) 0%, var(--gold-mid) 30%, var(--gold-dark) 70%, var(--gold-shadow) 100%);
  border-radius: 3px;
  box-shadow:
    inset 0 2px 4px rgba(255,255,255,.35),
    inset 0 -2px 4px rgba(0,0,0,.25),
    0 4px 20px rgba(0,0,0,.25),
    0 8px 40px rgba(0,0,0,.15);
  border: 2px solid var(--gold-dark);
}
.diorama-frame--museum::before {
  content: '';
  position: absolute;
  inset: 6px;
  border: 1px solid rgba(255,255,255,.2);
  border-radius: 2px;
  pointer-events: none;
}
.diorama-frame--museum::after {
  content: '';
  position: absolute;
  inset: 10px;
  border: 1px solid rgba(0,0,0,.15);
  border-radius: 1px;
  pointer-events: none;
}
.diorama-museum-mat {
  background: #f5f0e8;
  padding: 10px;
  box-shadow: inset 0 1px 4px rgba(0,0,0,.1);
}
.diorama-museum-mat iframe {
  border-radius: 0;
}

/* ── Terminal ─────────────────────────────────────────── */
.diorama-frame--terminal {
  background: #1e1e2e;
  border-radius: 10px;
  overflow: hidden;
  box-shadow:
    0 4px 20px rgba(0,0,0,.3),
    0 0 0 1px rgba(255,255,255,.06);
}
.diorama-terminal-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: linear-gradient(180deg, #2a2a3d, #232336);
  border-bottom: 1px solid rgba(255,255,255,.06);
  user-select: none;
}
.diorama-terminal-dots {
  display: flex;
  gap: 6px;
}
.diorama-terminal-dots i {
  display: block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.diorama-terminal-dots i:nth-child(1) { background: #ff5f56; }
.diorama-terminal-dots i:nth-child(2) { background: #ffbd2e; }
.diorama-terminal-dots i:nth-child(3) { background: #27c93f; }
.diorama-terminal-title {
  flex: 1;
  text-align: center;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace;
  font-size: .75rem;
  color: rgba(255,255,255,.45);
  padding-right: 52px; /* offset for dots so title is visually centered */
}

/* ── Postcard ─────────────────────────────────────────── */
.diorama-frame--postcard {
  background: #fdf8f0;
  padding: 14px;
  border-radius: 3px;
  box-shadow:
    0 2px 6px rgba(0,0,0,.08),
    0 6px 24px rgba(0,0,0,.06);
  border: 1px dashed #d4c5a9;
  transform: rotate(0.6deg);
}
.diorama-frame--postcard iframe {
  border-radius: 2px;
}
.diorama-postcard-stamp {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 40px;
  height: 48px;
  background: #fff;
  border: 2px dashed #c9b894;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(3deg);
  pointer-events: none;
}
.diorama-postcard-stamp-text {
  font-size: 22px;
  line-height: 1;
}
.diorama-postcard-mark {
  position: absolute;
  top: 18px;
  right: 52px;
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: .55rem;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: rgba(180,80,60,.35);
  border: 2px solid rgba(180,80,60,.25);
  border-radius: 50%;
  padding: 6px 8px;
  transform: rotate(-12deg);
  pointer-events: none;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Blueprint ────────────────────────────────────────── */
.diorama-frame--blueprint {
  background: #1a3a5c;
  padding: 16px;
  border-radius: 2px;
  box-shadow: 0 2px 12px rgba(0,0,0,.2);
  background-image:
    linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
  background-size: 20px 20px;
}
.diorama-frame--blueprint::before {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255,255,255,.12);
  pointer-events: none;
}
.diorama-frame--blueprint iframe {
  border: 1px solid rgba(255,255,255,.15);
}
.diorama-blueprint-label {
  margin-top: 8px;
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: .65rem;
  font-weight: 600;
  letter-spacing: .15em;
  text-transform: uppercase;
  color: rgba(255,255,255,.35);
  text-align: right;
  padding-right: 4px;
}

/* ── Browser ──────────────────────────────────────────── */
.diorama-frame--browser {
  background: #f0ebe6;
  border-radius: 10px;
  overflow: hidden;
  box-shadow:
    0 2px 8px rgba(0,0,0,.08),
    0 8px 30px rgba(0,0,0,.06);
  border: 1px solid #d5ccc3;
}
.diorama-browser-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: linear-gradient(180deg, #f5f0eb, #ece7e1);
  border-bottom: 1px solid #d5ccc3;
  user-select: none;
}
.diorama-browser-dots {
  display: flex;
  gap: 6px;
}
.diorama-browser-dots i {
  display: block;
  width: 11px;
  height: 11px;
  border-radius: 50%;
}
.diorama-browser-dots i:nth-child(1) { background: #ed6a5e; }
.diorama-browser-dots i:nth-child(2) { background: #f4bf4f; }
.diorama-browser-dots i:nth-child(3) { background: #61c554; }
.diorama-browser-url {
  flex: 1;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace;
  font-size: .72rem;
  color: #7a7067;
  background: #fff;
  border: 1px solid #d5ccc3;
  border-radius: 5px;
  padding: 4px 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;

  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-diorama-frames', '');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

// ─── Utility ───────────────────────────────────────────────────

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Expand CSS injection ──────────────────────────────────────

let expandStylesInjected = false;

function injectExpandStyles(): void {
  if (expandStylesInjected) return;
  expandStylesInjected = true;

  const css = `
/* ── Diorama Expand Styles ─────────────────────────────── */

.diorama-expandable {
  position: relative;
}

.diorama-expand-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: zoom-in;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
  z-index: 10;
  color: #fff;
  padding: 0;
  line-height: 1;
}
.diorama-expandable:hover .diorama-expand-btn,
.diorama-expand-btn:focus-visible {
  opacity: 1;
}
.diorama-expand-btn:hover {
  background: rgba(0, 0, 0, 0.75);
}

.diorama-expand-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  cursor: zoom-out;
  animation: diorama-fade-in 0.2s ease;
}

@keyframes diorama-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.diorama-expanded {
  position: fixed !important;
  top: 3vh !important;
  left: 3vw !important;
  width: 94vw !important;
  height: 94vh !important;
  z-index: 9999 !important;
  display: flex !important;
  flex-direction: column !important;
  animation: diorama-expand-in 0.25s ease;
}

@keyframes diorama-expand-in {
  from { opacity: 0.85; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}

.diorama-expanded .diorama-expand-btn {
  display: none;
}

.diorama-expanded > .diorama-frame {
  flex: 1 1 0 !important;
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  max-height: 100% !important;
}

.diorama-expanded > iframe,
.diorama-expanded .diorama-frame iframe {
  flex: 1 1 0 !important;
  height: auto !important;
  min-height: 0 !important;
}

/* ── Slim down frames when expanded (keep identity, reduce bulk) */

.diorama-expanded > .diorama-frame {
  overflow: hidden !important;
}

/* Museum: thin gold border instead of chunky gilded frame */
.diorama-expanded > .diorama-frame--museum {
  padding: 5px !important;
  border-radius: 6px !important;
  box-shadow:
    inset 0 1px 2px rgba(255,255,255,.25),
    0 4px 24px rgba(0,0,0,.18) !important;
}
.diorama-expanded > .diorama-frame--museum::before {
  inset: 2px !important;
}
.diorama-expanded > .diorama-frame--museum::after {
  display: none !important;
}
.diorama-expanded .diorama-museum-mat {
  padding: 3px !important;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
}
.diorama-expanded .diorama-museum-mat iframe {
  flex: 1 1 0 !important;
}

/* Polaroid: slim white border, compact caption */
.diorama-expanded > .diorama-frame--polaroid {
  padding: 6px 6px 0 6px !important;
  border-radius: 6px !important;
  box-shadow: 0 4px 24px rgba(0,0,0,.14) !important;
}
.diorama-expanded .diorama-polaroid-caption {
  padding: 6px 10px !important;
  font-size: .8rem !important;
  min-height: auto !important;
}

/* Standard: just tighten padding */
.diorama-expanded > .diorama-frame--standard {
  padding: 5px !important;
  border-radius: 6px !important;
}

/* Postcard: slim border, shrink stamp + postmark */
.diorama-expanded > .diorama-frame--postcard {
  padding: 5px !important;
  border-radius: 6px !important;
  box-shadow: 0 4px 24px rgba(0,0,0,.14) !important;
}
.diorama-expanded .diorama-postcard-stamp {
  width: 28px !important;
  height: 34px !important;
  top: -2px !important;
  right: 2px !important;
}
.diorama-expanded .diorama-postcard-mark {
  font-size: .45rem !important;
  padding: 4px 5px !important;
  top: 8px !important;
  right: 36px !important;
}

/* Blueprint: slim border, shrink label */
.diorama-expanded > .diorama-frame--blueprint {
  padding: 5px !important;
  border-radius: 6px !important;
  box-shadow: 0 4px 24px rgba(0,0,0,.18) !important;
}
.diorama-expanded > .diorama-frame--blueprint::before {
  inset: 2px !important;
}
.diorama-expanded .diorama-blueprint-label {
  margin-top: 4px !important;
  font-size: .55rem !important;
}

/* Terminal / Browser: already slim — just round corners */
.diorama-expanded > .diorama-frame--terminal,
.diorama-expanded > .diorama-frame--browser {
  border-radius: 10px !important;
  box-shadow: 0 4px 24px rgba(0,0,0,.2) !important;
}
`;

  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-diorama-expand', '');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}
