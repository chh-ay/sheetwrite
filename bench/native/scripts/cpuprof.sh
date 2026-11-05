#!/usr/bin/env bash
T=/home/vvin/learn/fa-results
cd /home/vvin/learn/sheetwrite-wt/fa-audit
for w in "independent-first-recompute;size=100000" "wide-fan-out-edit;size=100000" "criteria-multi-range-edit;size=100000" "text-lookup-many;size=1000" "sumifs-3-criteria;size=100000" "vlookup-many;size=1000" "linear-chain;size=64" "topology-remove-add;size=10000"; do
  name=$(echo "$w" | tr ';=' '__')
  node --cpu-prof --cpu-prof-interval 25 --cpu-prof-dir $T/cpuprof --cpu-prof-name $name.cpuprofile bench/src/formula-trace-replay.ts --engine-root $T/engine-named --min-ms 1500 "$T/traces/workload=$w.trace" | tail -1
done
