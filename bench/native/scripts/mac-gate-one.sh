#!/usr/bin/env bash
# mac-gate-one.sh <candidate checkout> <base checkout> <label> <engine>
cd "$1" || exit 1
SHEETWRITE_BENCH_ENGINE=$4 ~/learn/mac-quiet FoundationAudit bun bench/src/formula-gate.ts --base "$2" --output /Users/chhay/learn/fa-results/$3-mac-$4.json > /Users/chhay/learn/fa-results/$3-mac-$4.md 2>&1
echo "$3 $4 exit $? $(date)"
