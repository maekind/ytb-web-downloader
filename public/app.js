// ── Device identity ───────────────────────────────────────────────────────────
const DEVICE_ID = (() => {
  const key = 'ytb-device-id';
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
})();

const apiFetch = (url, opts = {}) =>
  fetch(url, { ...opts, headers: { 'X-Device-ID': DEVICE_ID, ...opts.headers } });

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  type: 'video',
  quality: '1080',
  jobs: new Map(),
  infoTimer: null,
  lastFetchedUrl: null,
};

const VIDEO_QUALITIES = [
  { label: '4K (2160p)',      value: '2160' },
  { label: '2K (1440p)',      value: '1440' },
  { label: 'Full HD (1080p)', value: '1080' },
  { label: 'HD (720p)',       value: '720'  },
  { label: '480p',            value: '480'  },
  { label: '360p',            value: '360'  },
];

const AUDIO_QUALITIES = [
  { label: '320 kbps', value: '320' },
  { label: '256 kbps', value: '256' },
  { label: '192 kbps', value: '192' },
  { label: '128 kbps', value: '128' },
  { label: '96 kbps',  value: '96'  },
];

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const urlInput          = $('url-input');
const clearBtn          = $('clear-btn');
const downloadBtn       = $('download-btn');
const qualitySelect     = $('quality-select');
const queueEl           = $('queue');
const emptyState        = $('empty-state');
const queueCount        = $('queue-count');
const clearCompletedBtn = $('clear-completed-btn');
const statusDot         = $('status-dot');
const videoPreview      = $('video-preview');
const previewThumb      = $('preview-thumb');
const previewTitle      = $('preview-title');
const previewMeta       = $('preview-meta');
const previewLoader     = $('preview-loader');
const toastsEl          = $('toasts');
const typeBtns          = document.querySelectorAll('.type-btn');

// ── Init ─────────────────────────────────────────────────────────────────────
function init() {
  populateQualities();
  bindEvents();
  loadExistingJobs();
  requestNotificationPermission();
}

function bindEvents() {
  urlInput.addEventListener('input', onUrlInput);
  urlInput.addEventListener('paste', () => setTimeout(() => onUrlInput(), 50));
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') triggerDownload(); });

  clearBtn.addEventListener('click', clearUrl);
  downloadBtn.addEventListener('click', triggerDownload);
  clearCompletedBtn.addEventListener('click', clearCompleted);

  typeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.type = btn.dataset.type;
      typeBtns.forEach((b) => b.classList.toggle('active', b === btn));
      populateQualities();
    });
  });

  qualitySelect.addEventListener('change', () => { state.quality = qualitySelect.value; });
}

// ── URL input / preview ───────────────────────────────────────────────────────
function onUrlInput() {
  const url = urlInput.value.trim();
  clearBtn.hidden = !url;
  clearTimeout(state.infoTimer);

  if (!url) { hidePreview(); return; }

  const videoId = extractVideoId(url);
  if (!videoId) { hidePreview(); return; }

  if (url !== state.lastFetchedUrl) {
    showPreviewSkeleton(videoId);
    state.infoTimer = setTimeout(() => fetchInfo(url, videoId), 700);
  }
}

function showPreviewSkeleton(videoId) {
  previewThumb.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  previewTitle.textContent = 'Cargando información…';
  previewMeta.textContent = '';
  videoPreview.hidden = false;
  previewLoader.hidden = false;
}

async function fetchInfo(url, videoId) {
  state.lastFetchedUrl = url;
  try {
    const res = await apiFetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    previewTitle.textContent = data.title || 'Sin título';
    previewMeta.textContent  = [data.uploader, data.duration].filter(Boolean).join('  ·  ');
    if (data.videoId) previewThumb.src = `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`;
  } catch {
    previewTitle.textContent = 'No se pudo obtener información';
    previewMeta.textContent  = '';
  } finally {
    previewLoader.hidden = true;
  }
}

function hidePreview() {
  videoPreview.hidden = true;
  previewTitle.textContent = '';
  previewMeta.textContent  = '';
  state.lastFetchedUrl = null;
}

function clearUrl() {
  urlInput.value = '';
  clearBtn.hidden = true;
  hidePreview();
  urlInput.focus();
}

// ── Qualities ─────────────────────────────────────────────────────────────────
function populateQualities() {
  const options = state.type === 'video' ? VIDEO_QUALITIES : AUDIO_QUALITIES;
  const defaultVal = state.type === 'video' ? '1080' : '192';
  qualitySelect.innerHTML = options
    .map((q) => `<option value="${q.value}"${q.value === defaultVal ? ' selected' : ''}>${q.label}</option>`)
    .join('');
  state.quality = defaultVal;
}

// ── Download ──────────────────────────────────────────────────────────────────
async function triggerDownload() {
  const url = urlInput.value.trim();
  if (!url) {
    urlInput.classList.add('shake');
    setTimeout(() => urlInput.classList.remove('shake'), 500);
    urlInput.focus();
    return;
  }

  downloadBtn.disabled = true;

  try {
    const res = await apiFetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type: state.type, quality: qualitySelect.value }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    const previewData = {
      id:       data.id,
      url,
      type:     state.type,
      quality:  qualitySelect.value,
      status:   'pending',
      progress: 0,
      title:    previewTitle.textContent || null,
      videoId:  extractVideoId(url),
      createdAt: Date.now(),
    };

    state.jobs.set(data.id, previewData);
    addJobCard(previewData);
    connectSSE(data.id);
    clearUrl();
    setStatus('busy');
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    downloadBtn.disabled = false;
  }
}

// ── SSE ───────────────────────────────────────────────────────────────────────
function connectSSE(id) {
  const es = new EventSource(`/api/progress/${id}`);

  es.onmessage = (e) => {
    const job = JSON.parse(e.data);
    state.jobs.set(id, job);
    updateJobCard(job);

    if (job.status === 'complete') {
      es.close();
      notifyComplete(job);
      refreshStatusDot();
      updateClearBtn();
    }
    if (job.status === 'error') {
      es.close();
      refreshStatusDot();
    }
  };

  es.onerror = () => es.close();
}

async function loadExistingJobs() {
  try {
    const res = await apiFetch('/api/jobs');
    const jobs = await res.json();
    for (const job of jobs) {
      state.jobs.set(job.id, job);
      addJobCard(job);
      if (job.status !== 'complete' && job.status !== 'error') connectSSE(job.id);
    }
    refreshStatusDot();
    updateClearBtn();
  } catch {
    // server not ready
  }
}

// ── Queue actions ─────────────────────────────────────────────────────────────
async function removeJob(id) {
  try {
    await apiFetch(`/api/jobs/${id}`, { method: 'DELETE' });
  } catch {
    // best-effort — remove from UI regardless
  }
  state.jobs.delete(id);
  document.getElementById(`job-${id}`)?.remove();
  if (state.jobs.size === 0) emptyState.hidden = false;
  updateQueueCount();
  updateClearBtn();
  refreshStatusDot();
}

async function clearCompleted() {
  try {
    await apiFetch('/api/jobs', { method: 'DELETE' });
  } catch {
    // best-effort
  }
  for (const id of state.jobs.keys()) {
    document.getElementById(`job-${id}`)?.remove();
    state.jobs.delete(id);
  }
  emptyState.hidden = false;
  updateQueueCount();
  updateClearBtn();
}

// ── Card rendering ────────────────────────────────────────────────────────────
function addJobCard(job) {
  emptyState.hidden = true;
  queueEl.prepend(buildCard(job));
  updateQueueCount();
  updateClearBtn();
}

function buildCard(job) {
  const card = document.createElement('div');
  card.id = `job-${job.id}`;
  card.className = cardClass(job.status);

  const videoId = job.videoId || extractVideoId(job.url || '');
  const thumbHTML = videoId
    ? `<img class="job-thumb" src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="" loading="lazy">`
    : `<div class="job-thumb-placeholder">${job.type === 'audio' ? '♪' : '▶'}</div>`;

  const qualityLabel = job.type === 'video' ? `MP4 · ${job.quality}p` : `MP3 · ${job.quality} kbps`;

  card.innerHTML = `
    <div class="job-top">
      <div class="job-thumb-wrap">${thumbHTML}</div>
      <div class="job-info">
        <span class="job-title">${esc(job.title || 'Cargando…')}</span>
        <span class="job-meta">${esc(qualityLabel)}</span>
      </div>
      <div class="job-right">
        ${badgeHTML(job.status)}
        ${actionsHTML(job)}
      </div>
    </div>
    ${progressHTML(job)}
    ${job.error ? `<span class="error-msg">${esc(job.error)}</span>` : ''}
  `;

  bindCardActions(card, job);
  return card;
}

function updateJobCard(job) {
  const card = document.getElementById(`job-${job.id}`);
  if (!card) { addJobCard(job); return; }

  card.className = cardClass(job.status);

  const titleEl = card.querySelector('.job-title');
  if (titleEl && job.title) titleEl.textContent = job.title;

  const rightEl = card.querySelector('.job-right');
  if (rightEl) {
    rightEl.innerHTML = badgeHTML(job.status) + actionsHTML(job);
    bindCardActions(card, job);
  }

  const fillEl  = card.querySelector('.progress-fill');
  const pctEl   = card.querySelector('.progress-pct');
  const speedEl = card.querySelector('.progress-speed');
  const etaEl   = card.querySelector('.progress-eta');
  const areaEl  = card.querySelector('.progress-area');

  if (areaEl) {
    if (job.status === 'complete' || job.status === 'error') {
      areaEl.remove();
    } else {
      if (fillEl)  fillEl.style.width    = `${job.progress}%`;
      if (pctEl)   pctEl.textContent     = `${Math.round(job.progress)}%`;
      if (speedEl) speedEl.textContent   = job.speed ? `↓ ${job.speed}` : '';
      if (etaEl)   etaEl.textContent     = job.eta   ? `ETA ${job.eta}` : '';
    }
  } else if (job.status !== 'complete' && job.status !== 'error') {
    card.insertAdjacentHTML('beforeend', progressHTML(job));
  }

  if (job.error && !card.querySelector('.error-msg')) {
    card.insertAdjacentHTML('beforeend', `<span class="error-msg">${esc(job.error)}</span>`);
  }
}

// ── HTML builders ─────────────────────────────────────────────────────────────
function cardClass(status) {
  return `job-card${status === 'complete' ? ' is-complete' : ''}${status === 'error' ? ' is-error' : ''}`;
}

function badgeHTML(status) {
  const map = {
    pending:     ['⏳', 'En cola'],
    downloading: ['⬇', 'Descargando'],
    processing:  ['⚙', 'Procesando'],
    complete:    ['✓', 'Listo'],
    error:       ['✕', 'Error'],
  };
  const [icon, label] = map[status] || ['?', status];
  return `<span class="badge badge-${status}">${icon} ${label}</span>`;
}

function actionsHTML(job) {
  if (job.status !== 'complete' && job.status !== 'error') return '';
  const dlBtn = job.status === 'complete' ? `
    <button class="action-btn dl-btn" data-id="${job.id}" title="Descargar al dispositivo">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 2v7M4 6.5l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 11h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </button>` : '';
  return dlBtn + `
    <button class="action-btn trash-btn" data-id="${job.id}" title="Eliminar de la cola">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M3 3.5l.7 7.5a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L11 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5.5 6.5v3M8.5 6.5v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
    </button>`;
}

function progressHTML(job) {
  if (job.status === 'complete' || job.status === 'error') return '';
  const pct = job.progress || 0;
  return `
    <div class="progress-area">
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%">
          <div class="playhead"></div>
        </div>
      </div>
      <div class="progress-stats">
        <span class="progress-pct">${Math.round(pct)}%</span>
        <span class="progress-speed">${job.speed ? `↓ ${job.speed}` : ''}</span>
        <span class="progress-eta">${job.eta ? `ETA ${job.eta}` : ''}</span>
      </div>
    </div>
  `;
}

function bindCardActions(card, job) {
  card.querySelector('.dl-btn')?.addEventListener('click', () => downloadFile(job.id));
  card.querySelector('.trash-btn')?.addEventListener('click', () => removeJob(job.id));
}

// ── File download ─────────────────────────────────────────────────────────────
function downloadFile(id) {
  const a = document.createElement('a');
  a.href = `/api/download/${id}`;
  a.click();
}

// ── Status dot & queue counters ───────────────────────────────────────────────
function setStatus(s) {
  statusDot.className = `status-dot ${s}`;
  statusDot.title = { ready: 'Listo', busy: 'Descargando', error: 'Error' }[s] || s;
}

function refreshStatusDot() {
  const running = [...state.jobs.values()].some(
    (j) => j.status === 'downloading' || j.status === 'processing' || j.status === 'pending'
  );
  const hasError = [...state.jobs.values()].some((j) => j.status === 'error');
  setStatus(running ? 'busy' : hasError ? 'error' : 'ready');
}

function updateQueueCount() {
  const n = state.jobs.size;
  queueCount.textContent = n;
  queueCount.hidden = n === 0;
}

function updateClearBtn() {
  clearCompletedBtn.hidden = state.jobs.size === 0;
}

// ── Notifications ─────────────────────────────────────────────────────────────
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function notifyComplete(job) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Descarga completada', {
      body: job.title || 'Archivo listo',
      icon: job.videoId ? `https://img.youtube.com/vi/${job.videoId}/default.jpg` : undefined,
    });
  }
}

// ── Toasts ────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = msg;
  toastsEl.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function extractVideoId(url) {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
