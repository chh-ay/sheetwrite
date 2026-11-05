#!/usr/bin/env bash
# One Mac profiling hold: /usr/bin/sample on native replays of edit workloads
# (their setup runs once, so samples are the timed edits and their restores).
set -u
B=/Users/chhay/learn/sheetwrite-wt/fa-native-target/release
R=/Users/chhay/learn/fa-results
mkdir -p $R/mac/sample
for w in "wide-fan-out-edit;size=100000" "criteria-multi-range-edit;size=100000" "text-lookup-many-edit;size=1000" "vlookup-many-edit;size=1000" "formula-constant-edit;size=100000" "let-reuse-edit;size=100000"; do
  name=$(echo "$w" | tr ';=' '__')
  $B/formula-replay --min-ms 8000 --warmup 2 "$R/traces/workload=$w.trace" > /dev/null &
  pid=$!
  sleep 2
  /usr/bin/sample $pid 4 1 -file $R/mac/sample/$name.txt > /dev/null 2>&1
  kill $pid 2>/dev/null; wait $pid 2>/dev/null
done
echo done $(date)
