#!/usr/bin/env bash
# run.sh <port> <browser...>: bundle the page, serve it inside this job, drive the proof.
set -uo pipefail
B=/home/vvin/learn/perfdeep/blit
mkdir -p $B/out
(cd /home/vvin/checkouts/pd-blitproof && bun build $B/harness.ts --target=browser --outdir $B/out > $B/out/bundle.log 2>&1) || { cat $B/out/bundle.log; exit 1; }
bun $B/serve.ts "$1" > $B/out/serve.log 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT
for i in $(seq 1 50); do curl -sf "http://127.0.0.1:$1/" > /dev/null && break; sleep 0.2; done
port=$1; shift
node $B/${DRIVER:-drive.mjs} "$port" "$@"
