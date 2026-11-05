#!/usr/bin/env bash
# profile.sh <binary> <trace> <output.data> [min-ms]
set -euo pipefail
binary=$1; trace=$2; out=$3; ms=${4:-3000}
dir=$(mktemp -d); mkfifo $dir/ctl $dir/ack
FORMULA_REPLAY_PERF_CONTROL=$dir/ctl,$dir/ack /home/vvin/learn/fa-tools/perf record -q -e cpu_core/cycles/u -c 50000 \
  --call-graph fp --user-callchains --control fifo:$dir/ctl,$dir/ack -D -1 -o "$out" -- "$binary" --min-ms "$ms" --warmup 2 "$trace"
rm -rf $dir
