#!/bin/bash
# Usage: ./scripts/bump-version.sh
# Bumps package.json's version (major.minor.timestamp) and commits it.
# Run on a feature branch before merging to main. Does not push.
set -e

cd "$(dirname "$0")/.."

VERSION_FILE="package.json"

current=$(grep -o '"version": *"[^"]*"' "$VERSION_FILE" | head -1 | grep -o '[0-9][^"]*')
major=$(echo "$current" | cut -d. -f1)
minor=$(echo "$current" | cut -d. -f2)

minor=$((minor + 1))
if [ "$minor" -ge 100 ]; then
  minor=0
  major=$((major + 1))
fi

timestamp=$(date +%s)
new_version="$major.$minor.$timestamp"

tmp=$(mktemp)
sed "s/\"version\": *\"[^\"]*\"/\"version\": \"$new_version\"/" "$VERSION_FILE" > "$tmp"
mv "$tmp" "$VERSION_FILE"

git add "$VERSION_FILE"
git commit -m "chore: bump version to $new_version"

echo "✓ Bumped version to $new_version"
