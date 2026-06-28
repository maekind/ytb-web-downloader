import { execSync } from 'child_process';

export function checkDependencies() {
  const missing = [];

  try {
    execSync('yt-dlp --version', { stdio: 'pipe' });
  } catch {
    missing.push('yt-dlp');
  }

  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
  } catch {
    missing.push('ffmpeg');
  }

  return missing;
}

export function getVersions() {
  const versions = {};
  try {
    versions.ytdlp = execSync('yt-dlp --version', { stdio: 'pipe' }).toString().trim();
  } catch {
    versions.ytdlp = null;
  }
  try {
    const out = execSync('ffmpeg -version', { stdio: 'pipe' }).toString();
    const match = out.match(/ffmpeg version ([\S]+)/);
    versions.ffmpeg = match ? match[1] : 'unknown';
  } catch {
    versions.ffmpeg = null;
  }
  return versions;
}
