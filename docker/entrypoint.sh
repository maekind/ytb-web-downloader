#!/bin/sh
# Best-effort yt-dlp update on every container start — YouTube changes
# frequently break older yt-dlp builds, so a stale image shouldn't require
# a manual rebuild just to keep downloads working. Never blocks startup.
set -u

/app/scripts/update-yt-dlp.sh || echo "[entrypoint] yt-dlp update failed, continuing with existing version"

exec "$@"
