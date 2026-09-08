#!/bin/bash
# Usage:
#   ./deploy.sh
# Requires a .env.deploy file (see .env.deploy.example) with:
#   DEPLOY_USER, DEPLOY_HOST, DEPLOY_PATH, DEPLOY_PORT
set -e

cd "$(dirname "$0")"

if [ ! -f .env.deploy ]; then
  echo "Missing .env.deploy file. Copy .env.deploy.example and fill in your values." >&2
  exit 1
fi
set -a
source .env.deploy
set +a

for var in DEPLOY_USER DEPLOY_HOST DEPLOY_PATH DEPLOY_PORT; do
  if [ -z "${!var}" ]; then
    echo "Missing $var in .env.deploy" >&2
    exit 1
  fi
done

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
      -e "ssh -p $DEPLOY_PORT" \
      ./ $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH

  echo "Rebuilding and restarting containers..."
  ssh -p $DEPLOY_PORT $DEPLOY_USER@$DEPLOY_HOST "
    set -e
    cd $DEPLOY_PATH
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
