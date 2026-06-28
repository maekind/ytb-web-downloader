# YTB Downloader

CLI and web interface to download YouTube videos and audio using [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## Requirements

- Node.js 18+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation)
- [ffmpeg](https://ffmpeg.org/download.html)

### macOS

```bash
brew install yt-dlp ffmpeg
```

### Linux (Debian/Ubuntu)

```bash
sudo apt install ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

## Installation

```bash
npm install
```

## Usage

### CLI

```bash
# Interactive mode
node src/index.js

# Direct download
node src/index.js <url> [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `-t, --type <type>` | `video` or `audio` | `video` |
| `-q, --quality <quality>` | Video: `144`–`4320`. Audio: `64`–`320` | `1080` / `192` |
| `-o, --output <dir>` | Output directory | `./downloads` |
| `--info` | Show video info without downloading | — |

**Examples:**

```bash
# Download audio at 320 kbps
node src/index.js https://youtu.be/dQw4w9WgXcQ -t audio -q 320

# Download 4K video
node src/index.js https://youtu.be/dQw4w9WgXcQ -t video -q 2160

# Show metadata only
node src/index.js https://youtu.be/dQw4w9WgXcQ --info
```

## Development

```bash
npm run serve       # production
npm run dev         # watch mode
```

Then open [http://localhost:3000](http://localhost:3000).

### Testing

```bash
npm test            # run tests once
npm run test:watch  # watch mode
npm run test:coverage
```

## License

Proprietary — see [LICENSE](LICENSE).
