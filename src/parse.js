/**
 * Helpers for parsing yt-dlp stdout/stderr lines.
 * Extracted here so they can be unit-tested independently.
 */

export function parseProgress(line) {
  const m = line.match(
    /\[download\]\s+([\d.]+)%(?:.*?at\s+([\S]+))?(?:.*?ETA\s+([\d:]+))?/
  );
  if (!m) return null;
  return {
    progress: parseFloat(m[1]),
    speed: m[2] ?? null,
    eta: m[3] ?? null,
  };
}

export function parseFilePath(line) {
  let m;
  m = line.match(/^\[download\] Destination: (.+)$/);
  if (m) return m[1].trim();

  m = line.match(/^\[Merger\] Merging formats into "(.+)"$/);
  if (m) return m[1].trim();

  m = line.match(/^\[ExtractAudio\] Destination: (.+)$/);
  if (m) return m[1].trim();

  return null;
}

export function isProcessingLine(line) {
  return (
    line.includes('[Merger]') ||
    line.includes('[ExtractAudio]') ||
    line.includes('[ffmpeg]')
  );
}
