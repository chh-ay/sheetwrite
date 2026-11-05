#!/usr/bin/env python3
"""Markdown phase breakdown per workload from `phases.py` output and a replay timing.

Usage: phase_table.py <phases-dir> <replay.tsv> <traces-dir> [workload-id ...]

Shares come from the perf profile; ns come from the replay's mean ns per run
(with `--counters`, IPC and instructions too). Short rebuilt fixtures are
sampled with their setup (see replay.rs), so their parse and source-write
shares are dropped and the rest renormalised.
"""

import csv
import os
import sys

PHASES = [
    "parse",
    "source write",
    "dependency index",
    "dirty collection",
    "pass ordering",
    "pass state",
    "evaluation",
    "cell read",
    "range read",
    "lookup",
    "result write",
    "pass driver",
    "other",
]
SETUP_PHASES = {"parse", "source write"}
PER_RUN_SAMPLING_NS = 5_000_000

# What one "unit" of each workload is, and how many units a run has.
UNITS = {
    "independent-parse-load": ("formula", lambda size: size),
    "independent-first-recompute": ("formula", lambda size: size),
    "linear-chain": ("formula", lambda size: size - 1),
    "wide-fan-out-edit": ("formula", lambda size: size),
    "scalar-edit-affects-100000": ("formula", lambda size: size),
    "formula-constant-edit": ("edit", lambda size: 1),
    "sum-multi-range": ("cell", lambda size: 2 * size),
    "countif-100k": ("row", lambda size: size),
    "criteria-range-edit": ("row", lambda size: size),
    "criteria-multi-range-edit": ("row", lambda size: size),
    "sumifs-3-criteria": ("row", lambda size: size),
    "sumproduct-vector-edit": ("row", lambda size: size),
    "lookup-range-edit": ("row", lambda size: size),
    "let-reuse-edit": ("row", lambda size: size),
    "percentile-covariance": ("row", lambda size: size),
    "vlookup-many": ("formula", lambda size: size),
    "vlookup-many-edit": ("formula", lambda size: size),
    "vlookup-many-sorted-edit": ("formula", lambda size: size),
    "xlookup-many-edit": ("formula", lambda size: size),
    "text-lookup-many-edit": ("formula", lambda size: size),
    "text-lookup-many-sorted-edit": ("formula", lambda size: size),
    "diamond-edit": ("formula", lambda size: 3 * size),
    "vlookup-many-sorted": ("formula", lambda size: size),
    "xlookup-many": ("formula", lambda size: size),
    "text-lookup-many": ("formula", lambda size: size),
    "text-lookup-many-sorted": ("formula", lambda size: size),
    "topology-remove-add": ("formula", lambda size: size),
    "unicode-text-date-edit": ("formula", lambda size: size),
}


def read_phases(path):
    shares = {}
    with open(path) as handle:
        for line in handle:
            fields = line.rstrip("\n").split("\t")
            if fields[0] == "phase":
                shares[fields[1]] = float(fields[2])
    return shares


def restores(traces, key):
    with open(os.path.join(traces, f"{key}.trace")) as handle:
        return handle.readline().rstrip("\n").split("\t")[3] == "1"


def main():
    phases_dir, replay, traces = sys.argv[1:4]
    selected = set(sys.argv[4:])
    rows = {}
    with open(replay) as handle:
        reader = csv.reader(handle, delimiter="\t")
        header = next(reader)
        for fields in reader:
            rows[fields[0]] = dict(zip(header, fields))

    print("| Workload | ns/run | unit | ns/unit | instr/unit | IPC | " + " | ".join(PHASES) + " |")
    print("| --- | ---: | --- | ---: | ---: | ---: | " + " | ".join("---:" for _ in PHASES) + " |")
    for key, row in sorted(rows.items()):
        workload = key.split(";")[0].removeprefix("workload=")
        size = int(key.split("size=")[1])
        if selected and workload not in selected:
            continue
        path = os.path.join(phases_dir, f"{key}.phases")
        if not os.path.exists(path):
            continue
        shares = read_phases(path)
        ns = float(row["ns_per_run"])
        if not restores(traces, key) and ns < PER_RUN_SAMPLING_NS and workload != "independent-parse-load":
            kept = sum(share for phase, share in shares.items() if phase not in SETUP_PHASES)
            shares = {phase: (0.0 if phase in SETUP_PHASES else share / kept) for phase, share in shares.items()}
        unit, count = UNITS.get(workload, ("run", lambda size: 1))
        units = count(size)
        instructions = float(row.get("instructions", "nan"))
        cycles = float(row.get("cycles", "nan"))
        cells = []
        for phase in PHASES:
            share = shares.get(phase, 0.0)
            cells.append(f"{share * 100:.0f}% · {share * ns / units:.1f}" if share >= 0.005 else "")
        print(
            f"| {workload} {size} | {ns:,.0f} | {unit} | {ns / units:.1f} | {instructions / units:.0f} | {instructions / cycles:.2f} | "
            + " | ".join(cells)
            + " |"
        )


if __name__ == "__main__":
    main()
