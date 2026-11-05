#!/usr/bin/env python3
"""Markdown table of one machine's formula-gate reports, one column group per engine.

Usage: gate_table.py <default-report.json> <full-report.json>

Each report is `formula-gate.ts --output`. Times are the gate's per-row
medians of the paired captures (ms); the ratio is the median paired
candidate/base ratio. The footer gives each engine's geometric mean and
median ratio.
"""

import json
import math
import statistics
import sys


def rows(path):
    with open(path) as handle:
        report = json.load(handle)
    return {row["key"]: row for row in report["verdict"]["timings"]}, len(report["pairs"])


def main():
    default, default_pairs = rows(sys.argv[1])
    full, full_pairs = rows(sys.argv[2])
    print(f"| Workload | default base ms | default develop ms | ratio | full base ms | full develop ms | ratio |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for key in default:
        name = key.replace("workload=", "").replace(";size=", " ")
        left = default[key]
        right = full.get(key)
        cells = [f"{left['baseMs']:.4f}", f"{left['candidateMs']:.4f}", f"{left['pairedRatio']:.3f}"]
        if right is not None:
            cells += [f"{right['baseMs']:.4f}", f"{right['candidateMs']:.4f}", f"{right['pairedRatio']:.3f}"]
        print(f"| {name} | {' | '.join(cells)} |")
    for label, table, pairs in (("default", default, default_pairs), ("full", full, full_pairs)):
        ratios = [row["pairedRatio"] for row in table.values()]
        geomean = math.exp(sum(math.log(ratio) for ratio in ratios) / len(ratios))
        print(f"\n{label}: {len(ratios)} rows, {pairs} pairs, geomean {geomean:.3f}, median {statistics.median(ratios):.3f}")


if __name__ == "__main__":
    main()
