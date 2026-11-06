#!/usr/bin/env bash
# linux-gate-one.sh <candidate> <base> <label> <slot> <engine>: A/B then A/A for one engine.
cd "$1" || exit 1
SHEETWRITE_BENCH_ENGINE=$5 BENCH_MEMORY_MAX=12G /home/vvin/learn/bench-run --slot $4 bun bench/src/formula-gate.ts --base "$2" --output /home/vvin/learn/fa-results/$3-linux-$5.json > /home/vvin/learn/fa-results/$3-linux-$5.md 2>&1
echo "$3 $5 A/B exit $? $(date)"
SHEETWRITE_BENCH_ENGINE=$5 BENCH_MEMORY_MAX=12G /home/vvin/learn/bench-run --slot $4 bun bench/src/formula-gate.ts --base "$2" --candidate "$2" --output /home/vvin/learn/fa-results/$3-aa-linux-$5.json > /home/vvin/learn/fa-results/$3-aa-linux-$5.md 2>&1
echo "$3 $5 A/A exit $? $(date)"
