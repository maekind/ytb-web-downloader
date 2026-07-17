import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync, statSync } from 'fs';
import { exec } from 'child_process';
import { downloadVideo, downloadAudio, getVideoInfo } from './downloader.js';
import { checkDependencies } from './checker.js';
import { parseProgress, isProcessingLine } from './parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'), { extensions: ['html'] }));

// In-memory job store
export const jobs = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDeviceId(req) {
  return req.headers['x-device-id'] || null;
}

function toPublic({ _clients, ...rest }) {
  return rest;
}

function sendSSE(client, job) {
  client.write(`data: ${JSON.stringify(toPublic(job))}\n\n`);
}

function broadcast(job) {
  for (const client of job._clients) sendSSE(client, job);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const info = await getVideoInfo(url);
    res.json({ ok: true, ...info });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/download', (req, res) => {
  const { url, type = 'video', quality, outputDir = './downloads' } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  const id = randomUUID();
  const job = {
    id,
    deviceId: getDeviceId(req),
    url,
    type,
    quality: quality || (type === 'video' ? '1080' : '192'),
    outputDir: path.resolve(outputDir),
    status: 'pending',
    progress: 0,
    eta: null,
    speed: null,
    title: null,
    uploader: null,
    duration: null,
    videoId: null,
    filePath: null,
    error: null,
    createdAt: Date.now(),
    _clients: new Set(),
  };

  jobs.set(id, job);
  res.json({ ok: true, id });
  startDownload(job);
});

app.get('/api/progress/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sendSSE(res, job);
  job._clients.add(res);
  req.on('close', () => job._clients.delete(res));
});

app.get('/api/jobs', (req, res) => {
  const did = getDeviceId(req);
  const now = Date.now();
  const list = [...jobs.values()]
    .filter((j) => j.deviceId === did)
    .map((j) => {
      if (j.status === 'complete' && j.expiresAt && now > j.expiresAt) j.status = 'expired';
      return toPublic(j);
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(list);
});

app.get('/api/download/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== 'complete' || !job.filePath) {
    return res.status(404).json({ error: 'File not available' });
  }
  const abs = path.resolve(job.filePath);
  if (!existsSync(abs)) {
    job.status = 'expired';
    return res.status(410).json({ error: 'File expired' });
  }

  const filename = path.basename(abs);
  const ext = path.extname(abs).toLowerCase();
  const mime = { '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.webm': 'video/webm' };
  const stat = statSync(abs);

  res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  createReadStream(abs).pipe(res);
});

// Remove a single finished job from the queue
app.delete('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (job.deviceId !== getDeviceId(req)) return res.status(403).json({ error: 'Forbidden' });
  jobs.delete(req.params.id);
  res.json({ ok: true });
});

// Clear all jobs for this device
app.delete('/api/jobs', (req, res) => {
  const did = getDeviceId(req);
  for (const [id, job] of jobs.entries()) {
    if (job.deviceId === did) jobs.delete(id);
  }
  res.json({ ok: true });
});

app.get('/api/open/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job?.filePath) return res.status(404).json({ error: 'File not found' });
  exec(`open "${path.resolve(job.filePath)}"`, (err) =>
    err ? res.status(500).json({ error: err.message }) : res.json({ ok: true })
  );
});

app.get('/api/reveal/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job?.filePath) return res.status(404).json({ error: 'File not found' });
  exec(`open -R "${path.resolve(job.filePath)}"`, (err) =>
    err ? res.status(500).json({ error: err.message }) : res.json({ ok: true })
  );
});

// ─── Job runner ──────────────────────────────────────────────────────────────

export async function startDownload(job) {
  const onLine = (line) => {
    const parsed = parseProgress(line);
    if (parsed) {
      job.status   = 'downloading';
      job.progress = parsed.progress;
      if (parsed.speed) job.speed = parsed.speed;
      if (parsed.eta)   job.eta   = parsed.eta;
      broadcast(job);
    }

    if (isProcessingLine(line)) {
      job.status   = 'processing';
      job.progress = 100;
      job.eta      = null;
      job.speed    = null;
      broadcast(job);
    }
  };

  try {
    const info = await getVideoInfo(job.url);
    job.title    = info.title;
    job.uploader = info.uploader;
    job.duration = info.duration;
    job.videoId  = info.videoId;
    job.status   = 'downloading';
    broadcast(job);

    const fn = job.type === 'audio' ? downloadAudio : downloadVideo;
    const result = await fn(job.url, { quality: job.quality, outputDir: job.outputDir, onLine });

    job.filePath  = result?.filePath ?? null;
    job.status    = 'complete';
    job.progress  = 100;
    job.eta       = null;
    job.speed     = null;
    job.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    broadcast(job);
  } catch (err) {
    job.status = 'error';
    job.error  = err.message;
    broadcast(job);
  }
}

// ─── Entry point (skipped when imported by tests) ────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const missing = checkDependencies();
  if (missing.length > 0) {
    console.error(`\n  Missing: ${missing.join(', ')}`);
    console.error('  Install: brew install yt-dlp ffmpeg\n');
    process.exit(1);
  }
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n  ▶  YTB Downloader  →  http://localhost:${PORT}\n`);
  });
}
