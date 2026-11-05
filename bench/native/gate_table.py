#!/usr/bin/env python3
"""Markdown table of one machine's formula-gate reports, one column group per engine.

Usage: gate_table.py <default-report.json> <full-report.json> [<default-aa.json> <full-aa.json>]

Each report is `formula-gate.ts --output`. Times are the gate's per-row
medians of the paired captures (ms); the ratio is the median paired
candidate/base ratio. With same-engine (A/A) reports, each engine also gets
the range of the A/A run's per-pair ratios for the row. The footer gives each
engine's geometric mean and median ratio, and the A/A geomean.
"""

import json
import math
import statistics
import sys


def load(path):
    with open(path) as handle:
        return json.load(handle)


def rows(report):
    return {row["key"]: row for row in report["verdict"]["timings"]}


def band(report, key):
    ratios = [
        pair["candidate"]["timings"][key] / pair["base"]["timings"][key]
        for pair in report["pairs"]
        if key in pair["candidate"]["timings"] and key in pair["base"]["timings"]
    ]
    return f"{min(ratios):.3f}–{max(ratios):.3f}"


def geomean(values):
    return math.exp(sum(math.log(value) for value in values) / len(values))


def main():
    reports = [load(path) for path in sys.argv[1:3]]
    aa = [load(path) for path in sys.argv[3:5]] if len(sys.argv) >= 5 else [None, None]
    tables = [rows(report) for report in reports]

    header = "| Workload |"
    rule = "| --- |"
    for label, same in zip(("default", "full"), aa):
        header += f" {label} 0.6.1 ms | {label} develop ms | ratio |"
        rule += " ---: | ---: | ---: |"
        if same is not None:
            header += " A/A band |"
            rule += " ---: |"
    print(header)
    print(rule)

    for key in tables[0]:
        cells = []
        for table, same in zip(tables, aa):
            row = table.get(key)
            if row is None:
                cells += ["", "", ""] + ([""] if same is not None else [])
                continue
            cells += [f"{row['baseMs']:.4f}", f"{row['candidateMs']:.4f}", f"{row['pairedRatio']:.3f}"]
            if same is not None:
                cells.append(band(same, key))
        name = key.replace("workload=", "").replace(";size=", " ")
        print(f"| {name} | {' | '.join(cells)} |")

    print()
    for label, table, report, same in zip(("default", "full"), tables, reports, aa):
        ratios = [row["pairedRatio"] for row in table.values()]
        line = (
            f"{label}: {len(ratios)} rows, {len(report['pairs'])} pairs, "
            f"geomean {geomean(ratios):.3f}, median {statistics.median(ratios):.3f}"
        )
        if same is not None:
            same_ratios = [row["pairedRatio"] for row in rows(same).values()]
            line += f"; A/A geomean {geomean(same_ratios):.3f}"
        print(line + "  ")


if __name__ == "__main__":
    main()
