#!/usr/bin/env bash
# profile-all.sh <engine: default|full> : perf profile + phase split of every trace
set -u
engine=$1
bin=/home/vvin/learn/sheetwrite-wt/fa-audit/bench/native/target-$engine/release/formula-replay
out=/home/vvin/learn/fa-results/perf-$engine; mkdir -p $out
cd /home/vvin/learn/fa-results
for trace in traces/*.trace; do
  key0=$(basename "$trace" .trace); [ -s "$out/$key0.phases" ] && continue
  key=$(basename "$trace" .trace)
  BENCH_MEMORY_MAX=12G /home/vvin/learn/bench-run ./profile.sh $bin "$trace" "$out/$key.data" 2000 > "$out/$key.time" 2>&1
  /home/vvin/learn/fa-tools/perf script -i "$out/$key.data" --inline -F ip,sym 2>/dev/null > "$out/$key.script"
  python3 /home/vvin/learn/sheetwrite-wt/fa-audit/bench/native/phases.py "$out/$key.script" --leaves 40 --unmatched 15 > "$out/$key.phases"
  rm -f "$out/$key.script"
  echo "$key done"
done
