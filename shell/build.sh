#!/bin/bash
# Builds the React shell (web-artifacts-builder: React + Tailwind + shadcn/ui, bundled with Parcel) around the Wathiq engine.
# Output: ../index.shell.html (single file; the engine scripts, fonts and logos stay as files next to it).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; BUILD="${SHELL_BUILD_DIR:-$HERE/.build}"
python3 "$HERE/sync-legacy.py"
if [ ! -d "$BUILD/node_modules" ]; then
  mkdir -p "$BUILD"; cp "$HERE/package.json" "$HERE/pnpm-lock.yaml" "$HERE"/tsconfig*.json "$HERE/components.json" "$HERE/postcss.config.js" "$BUILD/"
  (cd "$BUILD" && pnpm install)
fi
rm -rf "$BUILD/src" && cp -r "$HERE/src" "$BUILD/src" && cp "$HERE/index.html" "$HERE/tailwind.config.js" "$HERE/package.json" "$BUILD/"
cd "$BUILD" && rm -rf .parcel-cache dist && bash "${BUNDLER:-/mnt/skills/examples/web-artifacts-builder/scripts/bundle-artifact.sh}" >/dev/null
python3 - "$BUILD/bundle.html" "$HERE/../index.shell.html" <<'PY'
import sys, re
s = open(sys.argv[1], encoding='utf8').read()
s = re.sub(r'<title>.*?</title>', '', s, count=1)
head = '<title>وثيق PDF</title><meta name="claude:viewport-fit-sides" content="cover"><meta name="theme-color" content="#2448a6">'
s = re.sub(r'(<html[^>]*>)', r'\1' + head, s, count=1)
open(sys.argv[2], 'w', encoding='utf8').write(s)
print('index.shell.html', len(s)//1024, 'KB')
PY
