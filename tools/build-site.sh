#!/usr/bin/env bash
# Builds the website into dist/ with the game's own code minified (squashed so it is hard to read).
# The three.js and asset files are copied as they are. Run from the repo root: bash tools/build-site.sh
set -euo pipefail
rm -rf dist && mkdir -p dist
cp -r index.html credits.html privacy.html terms.html assets vendor favicon.ico robots.txt sitemap.xml llms.txt site.webmanifest sw.js dist/
npx --yes esbuild@0.24.0 js/*.js --minify --format=esm --outdir=dist/js --log-level=warning
npx --yes esbuild@0.24.0 css/*.css --minify --outdir=dist/css --log-level=warning
echo "Built dist/ ($(du -sh dist | cut -f1))"
