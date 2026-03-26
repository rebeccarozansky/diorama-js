import { describe, it, expect, beforeEach } from 'vitest';
import { createSandbox, buildErrorHTML } from '../../src/core/sandbox';

describe('SandboxManager', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  it('creates an iframe with sandbox attribute', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Hello</h1>',
    });

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('sandbox')).toBe('allow-scripts');
    instance.destroy();
  });

  it('uses srcdoc by default', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
    });

    const iframe = container.querySelector('iframe');
    expect(iframe!.srcdoc).toContain('<h1>Test</h1>');
    instance.destroy();
  });

  it('applies custom height', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      height: '300px',
    });

    const iframe = container.querySelector('iframe');
    expect(iframe!.style.height).toBe('300px');
    instance.destroy();
  });

  it('applies custom sandbox flags', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      sandboxFlags: ['allow-scripts', 'allow-modals'],
    });

    const iframe = container.querySelector('iframe');
    expect(iframe!.getAttribute('sandbox')).toBe('allow-scripts allow-modals');
    instance.destroy();
  });

  it('renders placeholder for click loading', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      loading: 'click',
      repoName: 'test/repo',
    });

    // Should show placeholder, not iframe
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('Click to launch preview');
    instance.destroy();
  });

  it('sets aria-label on iframe', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      repoName: 'octocat/hello-world',
    });

    const iframe = container.querySelector('iframe');
    expect(iframe!.getAttribute('aria-label')).toBe('Preview of octocat/hello-world');
    instance.destroy();
  });

  it('destroy removes iframe from DOM', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
    });

    expect(container.querySelector('iframe')).not.toBeNull();
    instance.destroy();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('update replaces iframe content', () => {
    const instance = createSandbox({
      container,
      html: '<h1>First</h1>',
    });

    instance.update('<h1>Second</h1>');
    const iframe = container.querySelector('iframe');
    expect(iframe!.srcdoc).toContain('<h1>Second</h1>');
    instance.destroy();
  });

  it('renders without a frame by default', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
    });

    expect(container.querySelector('.diorama-frame')).toBeNull();
    expect(container.querySelector('iframe')).not.toBeNull();
    instance.destroy();
  });

  it('wraps iframe in a standard frame', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      frame: 'standard',
    });

    const frame = container.querySelector('.diorama-frame--standard');
    expect(frame).not.toBeNull();
    const iframe = frame!.querySelector('iframe');
    expect(iframe).not.toBeNull();
    instance.destroy();
  });

  it('wraps iframe in a polaroid frame with caption', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      frame: 'polaroid',
      repoName: 'my/project',
    });

    const frame = container.querySelector('.diorama-frame--polaroid');
    expect(frame).not.toBeNull();
    const caption = frame!.querySelector('.diorama-polaroid-caption');
    expect(caption).not.toBeNull();
    expect(caption!.textContent).toBe('my/project');
    instance.destroy();
  });

  it('wraps iframe in a museum frame with mat', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      frame: 'museum',
    });

    const frame = container.querySelector('.diorama-frame--museum');
    expect(frame).not.toBeNull();
    const mat = frame!.querySelector('.diorama-museum-mat');
    expect(mat).not.toBeNull();
    expect(mat!.querySelector('iframe')).not.toBeNull();
    instance.destroy();
  });

  it('wraps iframe in a terminal frame with title bar', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      frame: 'terminal',
      repoName: 'test/repo',
    });

    const frame = container.querySelector('.diorama-frame--terminal');
    expect(frame).not.toBeNull();
    const bar = frame!.querySelector('.diorama-terminal-bar');
    expect(bar).not.toBeNull();
    const dots = bar!.querySelector('.diorama-terminal-dots');
    expect(dots).not.toBeNull();
    expect(dots!.querySelectorAll('i').length).toBe(3);
    const title = bar!.querySelector('.diorama-terminal-title');
    expect(title!.textContent).toBe('test/repo');
    instance.destroy();
  });

  it('wraps iframe in a postcard frame with stamp', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      frame: 'postcard',
    });

    const frame = container.querySelector('.diorama-frame--postcard');
    expect(frame).not.toBeNull();
    expect(frame!.querySelector('.diorama-postcard-stamp')).not.toBeNull();
    expect(frame!.querySelector('.diorama-postcard-mark')).not.toBeNull();
    instance.destroy();
  });

  it('wraps iframe in a blueprint frame with label', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      frame: 'blueprint',
      repoName: 'test/repo',
    });

    const frame = container.querySelector('.diorama-frame--blueprint');
    expect(frame).not.toBeNull();
    const label = frame!.querySelector('.diorama-blueprint-label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('DRAWING: TEST/REPO');
    instance.destroy();
  });

  it('wraps iframe in a browser frame with address bar', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      frame: 'browser',
      repoName: 'test/repo',
    });

    const frame = container.querySelector('.diorama-frame--browser');
    expect(frame).not.toBeNull();
    const bar = frame!.querySelector('.diorama-browser-bar');
    expect(bar).not.toBeNull();
    const dots = bar!.querySelector('.diorama-browser-dots');
    expect(dots).not.toBeNull();
    expect(dots!.querySelectorAll('i').length).toBe(3);
    const url = bar!.querySelector('.diorama-browser-url');
    expect(url).not.toBeNull();
    expect(url!.textContent).toContain('test.repo');
    instance.destroy();
  });

  it('injects frame CSS into document head exactly once', () => {
    const instance1 = createSandbox({
      container,
      html: '<h1>Test</h1>',
      frame: 'standard',
    });

    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    const instance2 = createSandbox({
      container: container2,
      html: '<h1>Test</h1>',
      frame: 'museum',
    });

    const styleEls = document.querySelectorAll('style[data-diorama-frames]');
    expect(styleEls.length).toBe(1);

    instance1.destroy();
    instance2.destroy();
    container2.remove();
  });

  it('does not render frame when frame is "none"', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      frame: 'none',
    });

    expect(container.querySelector('.diorama-frame')).toBeNull();
    expect(container.querySelector('iframe')).not.toBeNull();
    instance.destroy();
  });

  // ─── Expand tests ────────────────────────────────────────────

  it('adds expand button when expand is true', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      expand: true,
    });

    expect(container.classList.contains('diorama-expandable')).toBe(true);
    const btn = container.querySelector('.diorama-expand-btn');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-label')).toBe('Expand preview');
    instance.destroy();
  });

  it('does not add expand button by default', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
    });

    expect(container.classList.contains('diorama-expandable')).toBe(false);
    expect(container.querySelector('.diorama-expand-btn')).toBeNull();
    instance.destroy();
  });

  it('expands on button click and collapses on backdrop click', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      expand: true,
    });

    const btn = container.querySelector('.diorama-expand-btn') as HTMLElement;
    btn.click();

    expect(container.classList.contains('diorama-expanded')).toBe(true);
    const backdrop = document.querySelector('.diorama-expand-backdrop');
    expect(backdrop).not.toBeNull();

    (backdrop as HTMLElement).click();
    expect(container.classList.contains('diorama-expanded')).toBe(false);
    expect(document.querySelector('.diorama-expand-backdrop')).toBeNull();
    instance.destroy();
  });

  it('collapses on Escape key', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      expand: true,
    });

    const btn = container.querySelector('.diorama-expand-btn') as HTMLElement;
    btn.click();
    expect(container.classList.contains('diorama-expanded')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(container.classList.contains('diorama-expanded')).toBe(false);
    expect(document.querySelector('.diorama-expand-backdrop')).toBeNull();
    instance.destroy();
  });

  it('destroy cleans up expanded state', () => {
    const instance = createSandbox({
      container,
      html: '<h1>Test</h1>',
      expand: true,
    });

    const btn = container.querySelector('.diorama-expand-btn') as HTMLElement;
    btn.click();
    expect(document.querySelector('.diorama-expand-backdrop')).not.toBeNull();

    instance.destroy();
    expect(document.querySelector('.diorama-expand-backdrop')).toBeNull();
    expect(container.classList.contains('diorama-expanded')).toBe(false);
  });

  it('injects expand CSS into document head exactly once', () => {
    const instance1 = createSandbox({
      container,
      html: '<h1>Test</h1>',
      expand: true,
    });

    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    const instance2 = createSandbox({
      container: container2,
      html: '<h1>Test</h1>',
      expand: true,
    });

    const styleEls = document.querySelectorAll('style[data-diorama-expand]');
    expect(styleEls.length).toBe(1);

    instance1.destroy();
    instance2.destroy();
    container2.remove();
  });
});

describe('buildErrorHTML', () => {
  it('includes the error message', () => {
    const html = buildErrorHTML('Something went wrong');
    expect(html).toContain('Something went wrong');
    expect(html).toContain('Diorama: Render error');
  });

  it('escapes HTML in error message', () => {
    const html = buildErrorHTML('<script>alert("xss")</script>');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
