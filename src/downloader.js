import { spawn } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseProgress, parseFilePath } from './parse.js';

const spawnEnv = {
  ...process.env,
  PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin:/bin'}`,
};

const UPDATE_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts/update-yt-dlp.sh');
const UPDATE_COOLDOWN_MS = 5 * 60 * 1000;

let updatePromise = null;
let lastUpdateAt = 0;

// Runs the yt-dlp updater, deduped so concurrent failures share one run and
// throttled so a burst of unrelated errors (e.g. bad URLs) can't hammer
// pip/brew. Resolves false (without attempting an update) inside the cooldown.
export function updateYtDlp() {
  if (updatePromise) return updatePromise;
  if (Date.now() - lastUpdateAt < UPDATE_COOLDOWN_MS) return Promise.resolve(false);

  updatePromise = new Promise((resolve) => {
    const proc = spawn('sh', [UPDATE_SCRIPT], { env: spawnEnv });
    proc.on('close', (code) => {
      lastUpdateAt = Date.now();
      updatePromise = null;
      resolve(code === 0);
    });
    proc.on('error', () => {
      updatePromise = null;
      resolve(false);
    });
  });
  return updatePromise;
}

// Retries a failed yt-dlp call once after attempting a self-update — recovers
// from the common case where YouTube changes have broken an outdated binary.
async function withUpdateRetry(task) {
  try {
    return await task();
  } catch (err) {
    if (!(await updateYtDlp())) throw err;
    return task();
  }
}

export const VIDEO_QUALITIES = [
  { label: '4K (2160p)', value: '2160' },
  { label: '2K (1440p)', value: '1440' },
  { label: 'Full HD (1080p)', value: '1080' },
  { label: 'HD (720p)', value: '720' },
  { label: '480p', value: '480' },
  { label: '360p', value: '360' },
];

export const AUDIO_QUALITIES = [
  { label: '320 kbps', value: '320' },
  { label: '256 kbps', value: '256' },
  { label: '192 kbps', value: '192' },
  { label: '128 kbps', value: '128' },
  { label: '96 kbps', value: '96' },
];

export async function getVideoInfo(url) {
  return withUpdateRetry(() => fetchVideoInfo(url));
}

function fetchVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', ['--dump-json', '--no-playlist', url], { env: spawnEnv });
    let raw = '';
    let errRaw = '';

    proc.stdout.on('data', (d) => (raw += d.toString()));
    proc.stderr.on('data', (d) => (errRaw += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(errRaw.trim() || `yt-dlp exited with code ${code}`));
      try {
        const info = JSON.parse(raw);
        resolve({
          title: info.title,
          duration: info.duration_string,
          uploader: info.uploader,
          thumbnail: info.thumbnail,
          videoId: info.id,
        });
      } catch {
        reject(new Error('Could not parse video info'));
      }
    });

    proc.on('error', reject);
  });
}

export function downloadVideo(url, options = {}) {
  const { quality = '1080', outputDir = './downloads', onProgress, onLine } = options;

  ensureDir(outputDir);

  const args = [
    url,
    '--no-playlist',
    '-f', `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]`,
    '--merge-output-format', 'mp4',
    '-o', path.join(outputDir, '%(title)s.%(ext)s'),
    '--progress',
    '--newline',
  ];

  return withUpdateRetry(() => runProcess(args, onProgress, onLine));
}

export function downloadAudio(url, options = {}) {
  const { quality = '192', outputDir = './downloads', onProgress, onLine } = options;

  ensureDir(outputDir);

  const args = [
    url,
    '--no-playlist',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', `${quality}K`,
    '-o', path.join(outputDir, '%(title)s.%(ext)s'),
    '--progress',
    '--newline',
  ];

  return withUpdateRetry(() => runProcess(args, onProgress, onLine));
}

function runProcess(args, onProgress, onLine) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { env: spawnEnv });
    let filePath = null;
    let lastError = '';

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (onLine) onLine(trimmed);
      if (/^ERROR:/.test(trimmed)) lastError = trimmed;

      const parsed = parseProgress(trimmed);
      if (parsed && onProgress) onProgress(parsed.progress);

      const fp = parseFilePath(trimmed);
      if (fp) filePath = fp;
    };

    proc.stdout.on('data', (d) => d.toString().split('\n').forEach(handleLine));
    proc.stderr.on('data', (d) => d.toString().split('\n').forEach(handleLine));

    proc.on('close', (code) => {
      if (code === 0) resolve({ filePath });
      else reject(new Error(lastError || `yt-dlp exited with code ${code}`));
    });

    proc.on('error', reject);
  });
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
