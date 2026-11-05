#!/usr/bin/env python3
"""Markdown summary of a paired formula gate with its same-session A/A gate.

Usage: pr_table.py <label> <ab-default.json> <ab-full.json> <aa-default.json> <aa-full.json>

Prints one summary line per engine (verdict, pairs, geomean, A/A geomean,
rows beyond the A/A band) and a table of the rows whose paired ratio falls
outside the per-pair range of the A/A gate, then the full table in a
`<details>` block.
"""

import json
import math
import sys


def load(path):
    with open(path) as handle:
        return json.load(handle)


def band(report, key):
    ratios = [
        pair["candidate"]["timings"][key] / pair["base"]["timings"][key]
        for pair in report["pairs"]
        if key in pair["candidate"]["timings"] and key in pair["base"]["timings"]
    ]
    return min(ratios), max(ratios)


def geomean(values):
    return math.exp(sum(math.log(value) for value in values) / len(values))


def name(key):
    return key.replace("workload=", "").replace(";size=", " ")


def main():
    label = sys.argv[1]
    engines = {"default": (load(sys.argv[2]), load(sys.argv[4])), "full": (load(sys.argv[3]), load(sys.argv[5]))}

    summary = ["| Engine | Result | Pairs | Geomean (A/A) | Faster beyond A/A | Slower beyond A/A |", "| --- | --- | ---: | ---: | ---: | ---: |"]
    changed = ["| Engine | Row | Base ms | Candidate ms | Change | Paired ratio | A/A band |", "| --- | --- | ---: | ---: | --- | ---: | ---: |"]
    full = ["| Engine | Row | Base ms | Candidate ms | Paired ratio | A/A band | Limit |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |"]

    for engine, (ab, aa) in engines.items():
        rows = ab["verdict"]["timings"]
        faster = slower = 0
        for row in rows:
            low, high = band(aa, row["key"])
            ratio = row["pairedRatio"]
            full.append(
                f"| {engine} | {name(row['key'])} | {row['baseMs']:.4f} | {row['candidateMs']:.4f} | {ratio:.3f} | {low:.3f}–{high:.3f} | {row['ratioLimit']} |"
            )
            if low <= ratio <= high:
                continue
            if ratio < low:
                faster += 1
                speed = f"{1 / ratio:.2f}× faster"
            else:
                slower += 1
                speed = f"{ratio:.2f}× slower"
            changed.append(
                f"| {engine} | {name(row['key'])} | {row['baseMs']:.4f} | {row['candidateMs']:.4f} | {speed} | {ratio:.3f} | {low:.3f}–{high:.3f} |"
            )
        result = "pass" if ab["verdict"]["passed"] else "FAIL"
        aa_geomean = geomean([row["pairedRatio"] for row in aa["verdict"]["timings"]])
        summary.append(
            f"| {engine} | {result} | {len(ab['pairs'])} | {geomean([row['pairedRatio'] for row in rows]):.3f} ({aa_geomean:.3f}) | {faster} | {slower} |"
        )

    print(f"#### {label}\n")
    print("\n".join(summary))
    print()
    print("\n".join(changed))
    print(f"\n<details><summary>{label}: all rows</summary>\n")
    print("\n".join(full))
    print("\n</details>\n")


if __name__ == "__main__":
    main()
