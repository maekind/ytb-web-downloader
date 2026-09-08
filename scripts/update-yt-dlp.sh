#!/bin/sh
# Updates yt-dlp using whatever install method is present (pip, Homebrew, or
# the standalone binary's self-updater). Safe to run repeatedly — exits 0
# when yt-dlp is already current. Used both as the Docker container's
# startup step and as the app's self-heal on download failure.
set -eu

log() { echo "[update-yt-dlp] $*"; }

if ! command -v yt-dlp >/dev/null 2>&1; then
  log "yt-dlp not found on PATH, skipping update"
  exit 1
fi

before="$(yt-dlp --version 2>/dev/null || echo unknown)"
log "current version: $before"

if command -v pip3 >/dev/null 2>&1 && pip3 show yt-dlp >/dev/null 2>&1; then
  log "updating via pip3"
  pip3 install --break-system-packages -U yt-dlp 2>/dev/null || pip3 install -U yt-dlp
elif command -v brew >/dev/null 2>&1 && brew list yt-dlp >/dev/null 2>&1; then
  log "updating via Homebrew"
  brew upgrade yt-dlp
else
  log "updating via yt-dlp self-update"
  yt-dlp -U
fi

after="$(yt-dlp --version 2>/dev/null || echo unknown)"
if [ "$before" = "$after" ]; then
  log "already up to date ($after)"
else
  log "updated $before -> $after"
fi
