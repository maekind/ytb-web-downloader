#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { createRequire } from 'module';
import { checkDependencies, getVersions } from './checker.js';
import { downloadVideo, downloadAudio, getVideoInfo, VIDEO_QUALITIES, AUDIO_QUALITIES } from './downloader.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('ytb')
  .description('YouTube video and audio downloader')
  .version(version)
  .argument('[url]', 'YouTube URL to download')
  .option('-t, --type <type>', 'Download type: video | audio', 'video')
  .option('-q, --quality <quality>', 'Quality (e.g. 1080 for video, 192 for audio)')
  .option('-o, --output <dir>', 'Output directory', './downloads')
  .option('--info', 'Show video info without downloading')
  .action(async (url, opts) => {
    printBanner();
    checkDeps();

    // Interactive mode when no URL is given
    if (!url) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'url',
          message: 'YouTube URL:',
          validate: (v) => v.trim().length > 0 || 'URL is required',
        },
        {
          type: 'list',
          name: 'type',
          message: 'Download type:',
          choices: [
            { name: 'Video  (MP4)', value: 'video' },
            { name: 'Audio  (MP3)', value: 'audio' },
          ],
        },
        {
          type: 'list',
          name: 'quality',
          message: 'Quality:',
          choices: (prev) =>
            prev.type === 'video'
              ? VIDEO_QUALITIES.map((q) => ({ name: q.label, value: q.value }))
              : AUDIO_QUALITIES.map((q) => ({ name: q.label, value: q.value })),
          default: (prev) => (prev.type === 'video' ? '1080' : '192'),
        },
        {
          type: 'input',
          name: 'output',
          message: 'Output directory:',
          default: './downloads',
        },
      ]);

      url = answers.url.trim();
      opts.type = answers.type;
      opts.quality = answers.quality;
      opts.output = answers.output;
    }

    // Apply defaults
    if (!opts.quality) opts.quality = opts.type === 'video' ? '1080' : '192';

    // --info flag: just print metadata
    if (opts.info) {
      await showInfo(url);
      return;
    }

    await run(url, opts);
  });

program.parse();

// ---------------------------------------------------------------------------

function printBanner() {
  console.log(chalk.bold.red('\n  ▶  YTB Downloader') + chalk.gray('  v1.0.0\n'));
}

function checkDeps() {
  const missing = checkDependencies();
  if (missing.length === 0) return;

  console.error(chalk.red(`Missing required dependencies: ${missing.join(', ')}\n`));
  if (missing.includes('yt-dlp')) {
    console.log(chalk.yellow('  Install yt-dlp:') + '  brew install yt-dlp');
    console.log(chalk.gray('                   https://github.com/yt-dlp/yt-dlp#installation'));
  }
  if (missing.includes('ffmpeg')) {
    console.log(chalk.yellow('  Install ffmpeg:') + '  brew install ffmpeg');
  }
  console.log();
  process.exit(1);
}

async function showInfo(url) {
  process.stdout.write(chalk.gray('Fetching info... '));
  try {
    const info = await getVideoInfo(url);
    console.log(chalk.green('done\n'));
    console.log(chalk.bold('  Title:    ') + info.title);
    console.log(chalk.bold('  Duration: ') + (info.duration ?? 'N/A'));
    console.log(chalk.bold('  Uploader: ') + (info.uploader ?? 'N/A'));
    console.log();
  } catch (err) {
    console.log(chalk.red('failed'));
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  }
}

async function run(url, opts) {
  // Show video info first
  process.stdout.write(chalk.gray('Fetching info... '));
  let info;
  try {
    info = await getVideoInfo(url);
    console.log(chalk.green('done'));
  } catch (err) {
    console.log(chalk.red('failed'));
    console.error(chalk.red(`\nError: ${err.message}\n`));
    process.exit(1);
  }

  const typeLabel = opts.type === 'video' ? 'Video MP4' : 'Audio MP3';
  const qualityLabel =
    opts.type === 'video' ? `${opts.quality}p` : `${opts.quality} kbps`;

  console.log();
  console.log(chalk.bold('  ' + info.title));
  console.log(chalk.gray(`  ${typeLabel}  ·  ${qualityLabel}  →  ${opts.output}`));
  console.log();

  const bar = new cliProgress.SingleBar(
    {
      format:
        '  ' +
        chalk.cyan('{bar}') +
        ' {percentage}%  ' +
        chalk.gray('ETA {eta_formatted}'),
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
      clearOnComplete: false,
    },
    cliProgress.Presets.shades_classic
  );

  let started = false;

  const onProgress = (pct) => {
    if (!started) {
      bar.start(100, 0);
      started = true;
    }
    bar.update(Math.min(pct, 100));
  };

  // Suppress yt-dlp output lines (bar handles progress)
  const onLine = () => {};

  try {
    const downFn = opts.type === 'audio' ? downloadAudio : downloadVideo;
    await downFn(url, {
      quality: opts.quality,
      outputDir: opts.output,
      onProgress,
      onLine,
    });

    if (started) {
      bar.update(100);
      bar.stop();
    }

    console.log();
    console.log(chalk.green('  ✔  Download complete!'));
    console.log(chalk.gray(`     Saved to ${opts.output}\n`));
  } catch (err) {
    if (started) bar.stop();
    console.error(chalk.red(`\n  ✖  Error: ${err.message}\n`));
    process.exit(1);
  }
}
