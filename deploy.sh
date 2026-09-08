#!/bin/bash
# Usage:
#   ./deploy.sh
set -e

USER="marco"
HOST="REDACTED"
DEST_PATH="REDACTED"
PORT="REDACTED"

deploy_docker() {
  echo "Syncing project files to server..."
  rsync -avz \
      --exclude='.git/' \
      --exclude='node_modules/' \
      --exclude='downloads/' \
      --exclude='.claude/' \
      --exclude='tests/' \
      --exclude='.DS_Store' \
      --exclude='docker-compose.override.yml' \
      -e "ssh -p $PORT" \
      ./ $USER@$HOST:$DEST_PATH

  echo "Rebuilding and restarting containers..."
  ssh -p $PORT $USER@$HOST "
    set -e
    cd $DEST_PATH
    if docker compose version >/dev/null 2>&1; then
      docker compose up -d --build --remove-orphans
    else
      docker-compose up -d --build --remove-orphans
    fi
  "
  echo "Docker deploy complete!"
}

# --- SYNC PROJECT (app + cron) TO SERVER AND REBUILD ---
deploy_docker

new_version=$(grep -o '"version": *"[^"]*"' package.json | head -1 | grep -o '[0-9][^"]*')
echo "Deploy complete! Version $new_version"
