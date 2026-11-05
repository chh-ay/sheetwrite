#!/usr/bin/env python3
"""Markdown table: native replay, WASM replay and ideal-layout floor per workload.

Usage: gap_table.py <native-1.tsv> <native-2.tsv> <wasm-1.tsv> <wasm-2.tsv> <floor.tsv>

Native and WASM times are the mean of two runs, with the second/first ratio
as the A/A spread. Gaps are engine time over floor time; only workloads with
a floor appear in the gap columns.
"""

import csv
import math
import sys


def load(path):
    with open(path) as handle:
        reader = csv.reader(handle, delimiter="\t")
        next(reader)
        return {fields[0]: float(fields[2]) for fields in reader if len(fields) > 2}


def main():
    native_1, native_2, wasm_1, wasm_2, floor = (load(path) for path in sys.argv[1:6])
    print("| Workload | native µs | native A/A | WASM µs | WASM A/A | WASM/native | floor µs | native/floor | WASM/floor |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    ratios = []
    for key in sorted(native_1):
        native = (native_1[key] + native_2[key]) / 2
        wasm = (wasm_1[key] + wasm_2[key]) / 2
        ratios.append(wasm / native)
        cells = [
            f"{native / 1e3:,.1f}",
            f"{native_2[key] / native_1[key]:.3f}",
            f"{wasm / 1e3:,.1f}",
            f"{wasm_2[key] / wasm_1[key]:.3f}",
            f"{wasm / native:.2f}",
        ]
        if key in floor:
            cells += [f"{floor[key] / 1e3:,.2f}", f"{native / floor[key]:.1f}×", f"{wasm / floor[key]:.1f}×"]
        else:
            cells += ["", "", ""]
        print(f"| {key.removeprefix('workload=').replace(';size=', ' ')} | {' | '.join(cells)} |")
    geomean = math.exp(sum(math.log(ratio) for ratio in ratios) / len(ratios))
    print(f"\nWASM/native: geomean {geomean:.2f}, range {min(ratios):.2f}–{max(ratios):.2f} over {len(ratios)} workloads")


if __name__ == "__main__":
    main()
