#!/usr/bin/env bash
# One Mac timing hold: native replay, floors, WASM replay (Bun), native again (A/A).
set -u
B=/Users/chhay/learn/sheetwrite-wt/fa-native-target/release
R=/Users/chhay/learn/fa-results
cd /Users/chhay/learn/sheetwrite-wt/foundation-audit || exit 1
$B/formula-replay --min-ms 300 $R/traces/*.trace > $R/mac/native-default-1.tsv
$B/formula-floor --min-ms 300 > $R/mac/floor-1.tsv
bun bench/src/formula-trace-replay.ts --engine-root /Users/chhay/learn/sheetwrite-wt/fa-develop $R/traces/*.trace > $R/mac/wasm-bun-default.tsv
$B/formula-replay --min-ms 300 $R/traces/*.trace > $R/mac/native-default-2.tsv
echo done $(date)
