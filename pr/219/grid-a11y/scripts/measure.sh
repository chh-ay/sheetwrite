#!/usr/bin/env bash
# measure.sh <checkout> <outdir> <port>: serve the checkout's docs build and measure it.
set -u
cd "$1"
cp ~/logs/grida11y/scripts/measure.mjs node_modules/.grida11y-measure.mjs
PORT=$3 bun scripts/serve-docs.ts > "$2.server.log" 2>&1 &
server=$!
for _ in $(seq 120); do curl -sf "http://localhost:$3/" >/dev/null && break; sleep 1; done
node node_modules/.grida11y-measure.mjs "http://localhost:$3" "$2" /home/vvin/.bun/install/cache/axe-core@4.14.1@@@1/axe.min.js
status=$?
kill "$server"
exit $status
