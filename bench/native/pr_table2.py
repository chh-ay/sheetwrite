#!/usr/bin/env python3
"""Markdown summary of two paired formula gate rounds against two A/A rounds.

Usage: pr_table2.py <label> <engine>=<ab1.json>,<ab2.json>,<aa1.json>,<aa2.json> ...

A row's A/A band spans every per-pair ratio of both A/A rounds. A row counts as
faster or slower only when its paired ratio is beyond that band in both A/B
rounds; one round beyond it is reported as noise. Prints one summary line per
engine, the rows beyond the band in either round, and the full table in a
`<details>` block.
"""

import json
import math
import sys


def load(path):
    with open(path) as handle:
        return json.load(handle)


def pair_ratios(report, key):
    return [
        pair["candidate"]["timings"][key] / pair["base"]["timings"][key]
        for pair in report["pairs"]
        if key in pair["candidate"]["timings"] and key in pair["base"]["timings"]
    ]


def name(key):
    return key.replace("workload=", "").replace(";size=", " ")


def geomean(values):
    return math.exp(sum(math.log(value) for value in values) / len(values))


def main():
    label = sys.argv[1]
    summary = [
        "| Engine | Result (both rounds) | Geomean round 1 / 2 (A/A) | Faster in both | Slower in both | Beyond the band in one round only |",
        "| --- | --- | ---: | ---: | ---: | ---: |",
    ]
    changed = [
        "| Engine | Row | Paired ratio round 1 / 2 | A/A band | Verdict |",
        "| --- | --- | ---: | ---: | --- |",
    ]
    full = [
        "| Engine | Row | Base ms | Candidate ms | Paired ratio round 1 / 2 | A/A band |",
        "| --- | --- | ---: | ---: | ---: | ---: |",
    ]

    for argument in sys.argv[2:]:
        engine, paths = argument.split("=", 1)
        ab1, ab2, aa1, aa2 = (load(path) for path in paths.split(","))
        rows1 = {row["key"]: row for row in ab1["verdict"]["timings"]}
        rows2 = {row["key"]: row for row in ab2["verdict"]["timings"]}
        aa_rows = [row["pairedRatio"] for row in aa1["verdict"]["timings"] + aa2["verdict"]["timings"]]
        faster = slower = once = 0
        for key, first in rows1.items():
            second = rows2.get(key)
            ratios = pair_ratios(aa1, key) + pair_ratios(aa2, key)
            if second is None or not ratios:
                continue
            low, high = min(ratios), max(ratios)
            pair = (first["pairedRatio"], second["pairedRatio"])
            beyond = [ratio > high or ratio < low for ratio in pair]
            if all(ratio < low for ratio in pair):
                verdict = "faster"
                faster += 1
            elif all(ratio > high for ratio in pair):
                verdict = "slower"
                slower += 1
            elif any(beyond):
                verdict = "one round only"
                once += 1
            else:
                verdict = ""
            ratio_text = f"{pair[0]:.3f} / {pair[1]:.3f}"
            band_text = f"{low:.3f}–{high:.3f}"
            if verdict:
                changed.append(f"| {engine} | {name(key)} | {ratio_text} | {band_text} | {verdict} |")
            full.append(
                f"| {engine} | {name(key)} | {first['baseMs']:.4f} | {first['candidateMs']:.4f} | {ratio_text} | {band_text} |"
            )
        passed = ab1["verdict"]["passed"] and ab2["verdict"]["passed"]
        means = (
            geomean([row["pairedRatio"] for row in rows1.values()]),
            geomean([row["pairedRatio"] for row in rows2.values()]),
            geomean(aa_rows),
        )
        summary.append(
            f"| {engine} | {'pass' if passed else 'FAIL'} | {means[0]:.3f} / {means[1]:.3f} ({means[2]:.3f}) | {faster} | {slower} | {once} |"
        )

    print(f"#### {label}\n")
    print("\n".join(summary))
    print()
    print("\n".join(changed))
    print(f"\n<details><summary>{label}: all rows</summary>\n")
    print("\n".join(full))
    print("\n</details>")


if __name__ == "__main__":
    main()
