#!/usr/bin/env bash
# Publish config/*.json to the TV apps (GitHub Pages). See EDITING.md. Options: --dry-run --no-pull --no-push --no-wait --no-embed-check --force
exec node "$(dirname "$0")/publish.js" "$@"
