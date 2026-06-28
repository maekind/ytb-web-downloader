import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

// ─── Mocks (hoisted before imports) ──────────────────────────────────────────

vi.mock('../src/checker.js', () => ({
  checkDependencies: vi.fn(() => []),
  getVersions: vi.fn(() => ({ ytdlp: '2026.01.01', ffmpeg: '8.0' })),
}));

const mockGetVideoInfo = vi.fn();
const mockDownloadAudio = vi.fn();
const mockDownloadVideo = vi.fn();

vi.mock('../src/downloader.js', () => ({
  get getVideoInfo()  { return mockGetVideoInfo; },
  get downloadAudio() { return mockDownloadAudio; },
  get downloadVideo() { return mockDownloadVideo; },
  VIDEO_QUALITIES: [],
  AUDIO_QUALITIES: [],
}));

// ─── App + shared state ───────────────────────────────────────────────────────

const { app, jobs } = await import('../src/server.js');

// Temp dir for file download tests
let tmpDir;
let testFilePath;

beforeEach(() => {
  jobs.clear();

  tmpDir = mkdtempSync(path.join(tmpdir(), 'ytb-test-'));
  testFilePath = path.join(tmpDir, 'Rick Astley - Never Gonna.mp3');
  writeFileSync(testFilePath, 'fake-mp3-bytes');

  mockGetVideoInfo.mockResolvedValue({
    title: 'Rick Astley - Never Gonna Give You Up',
    duration: '3:33',
    uploader: 'Rick Astley',
    videoId: 'dQw4w9WgXcQ',
  });
  mockDownloadAudio.mockResolvedValue({ filePath: testFilePath });
  mockDownloadVideo.mockResolvedValue({ filePath: testFilePath });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

// ─── POST /api/info ───────────────────────────────────────────────────────────

describe('POST /api/info', () => {
  it('returns video metadata for a valid URL', async () => {
    const res = await request(app)
      .post('/api/info')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.title).toBe('Rick Astley - Never Gonna Give You Up');
    expect(res.body.videoId).toBe('dQw4w9WgXcQ');
  });

  it('returns 400 when getVideoInfo throws', async () => {
    mockGetVideoInfo.mockRejectedValueOnce(new Error('Video unavailable'));

    const res = await request(app)
      .post('/api/info')
      .send({ url: 'https://www.youtube.com/watch?v=invalid' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('Video unavailable');
  });

  it('returns 400 when URL is missing', async () => {
    const res = await request(app).post('/api/info').send({});
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/download ───────────────────────────────────────────────────────

describe('POST /api/download', () => {
  it('creates a job and returns its id', async () => {
    const res = await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-1')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'audio', quality: '192' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.id).toBe('string');
  });

  it('tags the job with the device id from the header', async () => {
    const res = await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'my-ipad')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'audio' });

    const job = jobs.get(res.body.id);
    expect(job.deviceId).toBe('my-ipad');
  });

  it('defaults to video 1080p when no quality given', async () => {
    const res = await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-1')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'video' });

    const job = jobs.get(res.body.id);
    expect(job.quality).toBe('1080');
  });

  it('defaults to audio 192kbps when no quality given', async () => {
    const res = await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-1')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'audio' });

    const job = jobs.get(res.body.id);
    expect(job.quality).toBe('192');
  });

  it('returns 400 when URL is missing', async () => {
    const res = await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-1')
      .send({ type: 'audio' });

    expect(res.status).toBe(400);
  });
});

// ─── GET /api/jobs ────────────────────────────────────────────────────────────

describe('GET /api/jobs', () => {
  it('returns only jobs belonging to the requesting device', async () => {
    // Device A creates a job
    await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-a')
      .send({ url: 'https://www.youtube.com/watch?v=aaa', type: 'audio' });

    // Device B creates a job
    await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-b')
      .send({ url: 'https://www.youtube.com/watch?v=bbb', type: 'audio' });

    const resA = await request(app).get('/api/jobs').set('X-Device-ID', 'device-a');
    const resB = await request(app).get('/api/jobs').set('X-Device-ID', 'device-b');

    expect(resA.body).toHaveLength(1);
    expect(resB.body).toHaveLength(1);
    expect(resA.body[0].deviceId).toBe('device-a');
    expect(resB.body[0].deviceId).toBe('device-b');
  });

  it('returns an empty array for a device with no jobs', async () => {
    const res = await request(app).get('/api/jobs').set('X-Device-ID', 'unknown-device');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('does not expose _clients in the response', async () => {
    await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-a')
      .send({ url: 'https://www.youtube.com/watch?v=aaa', type: 'audio' });

    const res = await request(app).get('/api/jobs').set('X-Device-ID', 'device-a');
    expect(res.body[0]).not.toHaveProperty('_clients');
  });
});

// ─── GET /api/progress/:id ────────────────────────────────────────────────────

describe('GET /api/progress/:id', () => {
  it('returns 404 for an unknown job id', async () => {
    const res = await request(app).get('/api/progress/nonexistent-id');
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/jobs/:id ─────────────────────────────────────────────────────

describe('DELETE /api/jobs/:id', () => {
  it('removes a completed job from the store', async () => {
    const post = await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-1')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'audio' });

    const id = post.body.id;
    jobs.get(id).status = 'complete';

    const del = await request(app)
      .delete(`/api/jobs/${id}`)
      .set('X-Device-ID', 'device-1');

    expect(del.status).toBe(200);
    expect(jobs.has(id)).toBe(false);
  });

  it('returns 403 when device does not own the job', async () => {
    const post = await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-owner')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'audio' });

    const del = await request(app)
      .delete(`/api/jobs/${post.body.id}`)
      .set('X-Device-ID', 'device-intruder');

    expect(del.status).toBe(403);
  });

  it('returns 404 for unknown job', async () => {
    const res = await request(app)
      .delete('/api/jobs/nonexistent')
      .set('X-Device-ID', 'device-1');
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/jobs ─────────────────────────────────────────────────────────

describe('DELETE /api/jobs', () => {
  it('removes all jobs for the device regardless of status', async () => {
    const mkJob = () =>
      request(app)
        .post('/api/download')
        .set('X-Device-ID', 'device-1')
        .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'audio' });

    const [r1, r2, r3] = await Promise.all([mkJob(), mkJob(), mkJob()]);
    jobs.get(r1.body.id).status = 'complete';
    jobs.get(r2.body.id).status = 'error';
    jobs.get(r3.body.id).status = 'downloading';

    await request(app).delete('/api/jobs').set('X-Device-ID', 'device-1');

    expect(jobs.has(r1.body.id)).toBe(false);
    expect(jobs.has(r2.body.id)).toBe(false);
    expect(jobs.has(r3.body.id)).toBe(false);
  });

  it('does not delete jobs belonging to other devices', async () => {
    const r1 = await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-a')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'audio' });

    const r2 = await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-b')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'audio' });

    await request(app).delete('/api/jobs').set('X-Device-ID', 'device-a');

    expect(jobs.has(r1.body.id)).toBe(false);
    expect(jobs.has(r2.body.id)).toBe(true);
  });
});

// ─── GET /api/download/:id ────────────────────────────────────────────────────

describe('GET /api/download/:id', () => {
  it('returns 404 for an unknown job', async () => {
    const res = await request(app).get('/api/download/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('returns 404 if job is not yet complete', async () => {
    const postRes = await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-1')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'audio' });

    // Mark it as still downloading
    const job = jobs.get(postRes.body.id);
    job.status = 'downloading';

    const res = await request(app).get(`/api/download/${postRes.body.id}`);
    expect(res.status).toBe(404);
  });

  it('streams the file with Content-Disposition attachment when complete', async () => {
    const postRes = await request(app)
      .post('/api/download')
      .set('X-Device-ID', 'device-1')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'audio' });

    // Wait for async startDownload (mocked, resolves immediately)
    await new Promise((r) => setTimeout(r, 50));

    const res = await request(app).get(`/api/download/${postRes.body.id}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toMatch(/Rick%20Astley/);
    expect(Number(res.headers['content-length'])).toBe('fake-mp3-bytes'.length);
  });
});
