import { Diorama } from 'diorama-js';
import type { FrameStyle } from 'diorama-js';

// ─── Project definitions ─────────────────────────────────────────

interface ProjectDef {
  id: string;
  title: string;
  repo: string;
  subdirectory?: string;
  tier: 'static' | 'esm' | 'jsx' | 'vite';
  frame: FrameStyle;
  expand?: boolean;
  description: string;
}

const projects: ProjectDef[] = [
  {
    id: 'checkwave',
    title: 'checkwave',
    repo: 'https://github.com/hakimel/css',
    subdirectory: 'checkwave',
    tier: 'static',
    frame: 'polaroid',
    expand: true,
    description: 'CSS checkbox wave animation by Hakim El Hattab',
  },
  {
    id: 'device-loop',
    title: 'device-loop',
    repo: 'https://github.com/hakimel/css',
    subdirectory: 'device-loop',
    tier: 'static',
    frame: 'museum',
    expand: true,
    description: 'Infinite CSS device animation loop',
  },
  {
    id: 'progress-nav',
    title: 'progress-nav',
    repo: 'https://github.com/hakimel/css',
    subdirectory: 'progress-nav',
    tier: 'static',
    frame: 'standard',
    description: 'Scroll-linked progress indicator for navigation',
  },
  {
    id: 'cloudy-spiral',
    title: 'cloudy-spiral',
    repo: 'https://github.com/hakimel/css',
    subdirectory: 'cloudy-spiral',
    tier: 'static',
    frame: 'blueprint',
    description: 'Pure CSS animated cloudy spiral',
  },
  {
    id: 'resume',
    title: 'bootstrap-resume',
    repo: 'https://github.com/StartBootstrap/startbootstrap-resume',
    subdirectory: 'dist',
    tier: 'static',
    frame: 'postcard',
    expand: true,
    description: 'Polished resume/CV template built with Bootstrap 5',
  },
  {
    id: 'flexing-pagination',
    title: 'flexing-pagination',
    repo: 'https://github.com/hakimel/css',
    subdirectory: 'flexing-pagination',
    tier: 'static',
    frame: 'browser',
    expand: true,
    description: 'Animated flexbox pagination component',
  },
  {
    id: 'vite-vanilla',
    title: 'vite-vanilla',
    repo: 'https://github.com/vitejs/vite',
    subdirectory: 'packages/create-vite/template-vanilla',
    tier: 'vite',
    frame: 'terminal',
    description: 'Official Vite vanilla JS starter template',
  },
  {
    id: 'vite-vanilla-ts',
    title: 'vite-vanilla-ts',
    repo: 'https://github.com/vitejs/vite',
    subdirectory: 'packages/create-vite/template-vanilla-ts',
    tier: 'vite',
    frame: 'none',
    description: 'Official Vite vanilla TypeScript starter template',
  },
  {
    id: 'vite-react',
    title: 'vite-react',
    repo: 'https://github.com/vitejs/vite',
    subdirectory: 'packages/create-vite/template-react',
    tier: 'vite',
    frame: 'standard',
    expand: true,
    description: 'Official Vite React JSX starter template',
  },
];

// ─── Logging ───────────────────────────────────────────────────

const consoleBody = document.getElementById('console-body')!;

function log(message: string, level: 'info' | 'success' | 'error' = 'info') {
  const now = new Date();
  const ts = now.toLocaleTimeString('en-US', { hour12: false });
  const entry = document.createElement('div');
  entry.className = `log ${level}`;
  entry.innerHTML = `<span class="timestamp">${ts}</span> ${escapeHTML(message)}`;
  consoleBody.appendChild(entry);
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Status tracking ──────────────────────────────────────────

const statusMap = new Map<string, 'loading' | 'success' | 'error'>();

function updateStatusBar() {
  const bar = document.getElementById('status-bar')!;
  const total = projects.length;
  const loaded = [...statusMap.values()].filter((s) => s === 'success').length;
  const errors = [...statusMap.values()].filter((s) => s === 'error').length;
  const loading = [...statusMap.values()].filter((s) => s === 'loading').length;

  bar.innerHTML = `
    <div class="status-item"><span class="dot" style="background:#9c9ca6"></span> ${total} total</div>
    ${loading > 0 ? `<div class="status-item"><span class="dot" style="background:#7c3aed"></span> ${loading} loading</div>` : ''}
    ${loaded > 0 ? `<div class="status-item"><span class="dot" style="background:#16a34a"></span> ${loaded} ok</div>` : ''}
    ${errors > 0 ? `<div class="status-item"><span class="dot" style="background:#dc2626"></span> ${errors} err</div>` : ''}
  `;

  // Update header indicator
  const headerStatus = document.getElementById('header-status')!;
  const indicator = headerStatus.querySelector('.indicator')!;
  const label = headerStatus.querySelector('span:last-child')!;
  if (loading > 0) {
    indicator.classList.remove('active');
    label.textContent = `${loading} loading`;
  } else if (loaded === total) {
    indicator.classList.add('active');
    label.textContent = `${loaded}/${total} ok`;
  } else {
    indicator.classList.add('active');
    label.textContent = `${loaded}/${total} ok, ${errors} err`;
  }
}

// ─── Render project items ──────────────────────────────────────

const grid = document.getElementById('project-grid')!;

for (const project of projects) {
  const repoShort = project.repo.replace('https://github.com/', '');
  const displayPath = project.subdirectory
    ? `${repoShort}/${project.subdirectory}`
    : repoShort;
  const linkHref = project.subdirectory
    ? `${project.repo}/tree/master/${project.subdirectory}`
    : project.repo;

  const item = document.createElement('div');
  item.className = 'project-item';
  item.innerHTML = `
    <div class="project-header">
      <span class="project-title">${escapeHTML(project.title)}</span>
      <div class="project-badges">
        ${project.frame !== 'none' ? `<span class="frame-badge">${escapeHTML(project.frame)}</span>` : ''}
        <span class="tier-badge ${project.tier}">${project.tier}</span>
      </div>
    </div>
    <a class="project-link" href="${linkHref}" target="_blank" rel="noopener">${escapeHTML(displayPath)}</a>
    <div class="project-preview" id="preview-${project.id}"></div>
  `;
  grid.appendChild(item);
}

// ─── Initialize Diorama and render ─────────────────────────────

log('init');

const diorama = new Diorama({
  cache: true,
  cacheTTL: 3600,
  maxConcurrentFetches: 6,
  timeout: 45_000,
});

log('diorama ready, starting renders');

async function renderProject(project: ProjectDef) {
  const containerId = `#preview-${project.id}`;
  statusMap.set(project.id, 'loading');
  updateStatusBar();
  log(`fetch ${project.title} <- ${project.repo.replace('https://github.com/', '')}${project.subdirectory ? '/' + project.subdirectory : ''}`);

  const startTime = performance.now();

  try {
    await diorama.render(containerId, project.repo, {
      subdirectory: project.subdirectory,
      height: '300px',
      loading: 'eager',
      frame: project.frame,
      expand: project.expand,
      onLoad: () => {
        const elapsed = (performance.now() - startTime).toFixed(0);
        statusMap.set(project.id, 'success');
        updateStatusBar();
        log(`ok ${project.title} ${elapsed}ms`, 'success');
      },
      onError: (err) => {
        const elapsed = (performance.now() - startTime).toFixed(0);
        statusMap.set(project.id, 'error');
        updateStatusBar();
        log(`err ${project.title} ${elapsed}ms: ${err.message}`, 'error');
      },
    });
  } catch (err) {
    statusMap.set(project.id, 'error');
    updateStatusBar();
    log(`err ${project.title}: ${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

(async () => {
  for (const project of projects) {
    await renderProject(project);
  }
  log('all renders complete');
})();
