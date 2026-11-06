#!/usr/bin/env bash
# One exclusive Linux hold (CPU 4): native replay with counters, floors and the
# WASM replay in Bun, each twice where it matters for the A/A band.
set -u
T=/home/vvin/learn/fa-results; B=/home/vvin/learn/sheetwrite-wt/fa-audit/bench/native/target-default/release
D=/home/vvin/learn/sheetwrite-wt/fa-develop
mkdir -p $T/excl
cd /home/vvin/learn/sheetwrite-wt/fa-audit || exit 1
$B/formula-replay --counters --min-ms 300 $T/traces/*.trace > $T/excl/native-1.tsv
bun bench/src/formula-trace-replay.ts --engine-root $D --min-ms 300 $T/traces/*.trace > $T/excl/wasm-bun-1.tsv
$B/formula-floor --min-ms 300 > $T/excl/floor.tsv
$B/formula-replay --counters --min-ms 300 $T/traces/*.trace > $T/excl/native-2.tsv
bun bench/src/formula-trace-replay.ts --engine-root $D --min-ms 300 $T/traces/*.trace > $T/excl/wasm-bun-2.tsv
echo done $(date)
