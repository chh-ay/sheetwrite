#!/usr/bin/env bash
# run.sh <port> <browser...>: bundle develop's core, the PR's core and the page; serve inside this job; drive.
set -uo pipefail
R=/home/vvin/learn/perfdeep/rest
for e in entry-dev entry-pr page; do (cd /home/vvin/checkouts/pd-blitproof && bun build $R/$e.ts --target=browser --outdir $R/out > $R/out/bundle-$e.log 2>&1) || { cat $R/out/bundle-$e.log; exit 1; }; done
bun $R/serve.ts "$1" > $R/out/serve.log 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT
for i in $(seq 1 50); do curl -sf "http://127.0.0.1:$1/" > /dev/null && break; sleep 0.2; done
port=$1; shift
node $R/drive.mjs "$port" "$@"
