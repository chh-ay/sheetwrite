#!/usr/bin/env bash
set -u
export PATH=$HOME/.cargo/bin:$PATH
cd /Users/chhay/learn/sheetwrite-wt/fa-develop || exit 1
for engine in default full; do
  SHEETWRITE_BENCH_ENGINE=$engine ~/learn/mac-quiet FoundationAudit \
    bun bench/src/formula-gate.ts --base /Users/chhay/learn/sheetwrite-wt/fa-v061 \
    --output /Users/chhay/learn/fa-results/cumulative-mac-$engine.json \
    > /Users/chhay/learn/fa-results/cumulative-mac-$engine.md 2> /Users/chhay/learn/fa-results/cumulative-mac-$engine.err
  echo "$engine exit $? $(date)"
done
