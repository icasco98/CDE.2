#!/bin/sh
# Double-click to run the tool: installs once, then opens it in the browser.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node 22 or newer is needed. Install it from https://nodejs.org and run this again."
  read -r _
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing, once..."
  npm ci || { read -r _; exit 1; }
fi
npm run dev -- --open
