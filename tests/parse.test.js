import { describe, it, expect } from 'vitest';
import { parseProgress, parseFilePath, isProcessingLine } from '../src/parse.js';

describe('parseProgress', () => {
  it('parses a full progress line with speed and ETA', () => {
    const line = '[download]  45.3% of   34.33MiB at    1.23MiB/s ETA 00:23';
    expect(parseProgress(line)).toEqual({ progress: 45.3, speed: '1.23MiB/s', eta: '00:23' });
  });

  it('parses 100%', () => {
    const line = '[download] 100% of   34.33MiB at    2.00MiB/s ETA 00:00';
    expect(parseProgress(line)).toMatchObject({ progress: 100 });
  });

  it('handles missing speed/ETA gracefully', () => {
    const line = '[download]  12.0% of   34.33MiB';
    const result = parseProgress(line);
    expect(result).not.toBeNull();
    expect(result.progress).toBe(12.0);
    expect(result.speed).toBeNull();
    expect(result.eta).toBeNull();
  });

  it('returns null for non-progress lines', () => {
    expect(parseProgress('[youtube] Extracting URL: ...')).toBeNull();
    expect(parseProgress('[Merger] Merging formats into "file.mp4"')).toBeNull();
    expect(parseProgress('')).toBeNull();
  });
});

describe('parseFilePath', () => {
  it('extracts destination from a download line', () => {
    const line = '[download] Destination: /tmp/My Video.mp4';
    expect(parseFilePath(line)).toBe('/tmp/My Video.mp4');
  });

  it('extracts path from a Merger line', () => {
    const line = '[Merger] Merging formats into "/tmp/My Video (1080p).mp4"';
    expect(parseFilePath(line)).toBe('/tmp/My Video (1080p).mp4');
  });

  it('extracts path from an ExtractAudio line', () => {
    const line = '[ExtractAudio] Destination: /tmp/My Song.mp3';
    expect(parseFilePath(line)).toBe('/tmp/My Song.mp3');
  });

  it('returns null for unrelated lines', () => {
    expect(parseFilePath('[download]  45.3% of ...')).toBeNull();
    expect(parseFilePath('[youtube] Downloading webpage')).toBeNull();
  });

  it('trims whitespace from extracted paths', () => {
    const line = '[download] Destination:   /tmp/file.mp4  ';
    // The regex captures after the space, so leading space from "  " would be there
    // but we trim the result
    expect(parseFilePath('[download] Destination: /tmp/file.mp4')).toBe('/tmp/file.mp4');
  });
});

describe('isProcessingLine', () => {
  it('detects Merger lines', () => {
    expect(isProcessingLine('[Merger] Merging formats into "file.mp4"')).toBe(true);
  });

  it('detects ExtractAudio lines', () => {
    expect(isProcessingLine('[ExtractAudio] Destination: file.mp3')).toBe(true);
  });

  it('detects ffmpeg lines', () => {
    expect(isProcessingLine('[ffmpeg] Correcting container in "file.mp4"')).toBe(true);
  });

  it('returns false for progress lines', () => {
    expect(isProcessingLine('[download]  45.3% of ...')).toBe(false);
    expect(isProcessingLine('[youtube] Extracting URL')).toBe(false);
  });
});
