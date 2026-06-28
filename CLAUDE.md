# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                  # run all tests once (Vitest)
npm run test:watch        # watch mode
npm run test:coverage     # coverage via v8

npx vitest run tests/parse.test.js    # run a single test file

npm start                 # CLI entrypoint (src/index.js)
npm run serve             # web server on :3000
npm run dev               # web server with --watch
```

System dependencies required: `brew install yt-dlp ffmpeg`

## Architecture

There are two independent entry points sharing the same core:

**CLI** (`src/index.js`) — Commander + Inquirer interactive prompt. Calls `downloader.js` directly and renders a `cli-progress` bar via the `onProgress` callback.

**Web server** (`src/server.js`) — Express app that wraps the same downloader behind a REST API. Downloads run as background jobs stored in a module-level `Map`. Progress is pushed to connected clients over SSE (`GET /api/progress/:id`). Jobs are scoped per device via the `X-Device-ID` request header (no auth). The server only starts listening when the file is run directly (`process.argv[1]` check), so importing it in tests does not bind a port. The exported `app` and `jobs` are used directly in tests.

**Core modules:**
- `src/downloader.js` — spawns `yt-dlp` for all network operations. `PATH` is explicitly extended with Homebrew paths (`/opt/homebrew/bin:/usr/local/bin`) so the binary is found regardless of shell environment.
- `src/parse.js` — pure functions that parse raw yt-dlp stdout lines into structured progress, file path, and processing-stage signals. Extracted here specifically to be unit-testable without spawning processes.
- `src/checker.js` — synchronous dependency checks via `execSync`.

**Frontend** (`public/`) — static files served by Express from `/`.

## Testing

Tests use Vitest + Supertest. `src/downloader.js` and `src/checker.js` are fully mocked in `server.test.js` so no real yt-dlp calls happen. `parse.test.js` tests the parsing helpers directly with raw yt-dlp output strings.

Coverage excludes `src/index.js` (CLI entry point) — see `vitest.config.js`.
