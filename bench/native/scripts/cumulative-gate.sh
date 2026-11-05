#!/usr/bin/env bash
set -u
cd /home/vvin/learn/sheetwrite-wt/fa-develop
for engine in default full; do
  SHEETWRITE_BENCH_ENGINE=$engine BENCH_MEMORY_MAX=12G /home/vvin/learn/bench-run --slot 2 \
    bun bench/src/formula-gate.ts --base /home/vvin/learn/sheetwrite-wt/fa-v061 \
    --output /home/vvin/learn/fa-results/cumulative-linux-$engine.json \
    > /home/vvin/learn/fa-results/cumulative-linux-$engine.md 2> /home/vvin/learn/fa-results/cumulative-linux-$engine.err
  echo "$engine exit $?"
done
