#!/usr/bin/env python3
"""Share of a replay profile spent in the scalar function-call path.

Usage: callpath.py <perf-script-output[.gz]>...

For each sample, the innermost engine frame (inlined frames included) decides
where it goes:
- `accumulator`: `FuncAccumulator` methods (argument vectors, push, finish);
- `functions`: `eval::functions::*` (dispatch in `apply_func`, arity checks,
  argument coercion helpers such as `number_arg`);
- `eval_func`: `CellStore::eval_func` itself (special-case checks before the
  generic path, argument classification).
Allocator and standard-library frames below them count with them. Prints one
tab-separated line per profile: name, samples, then the three shares and
their sum.
"""

import collections
import functools
import gzip
import os
import re
import sys

from phases import bare, samples

ENGINE = re.compile(r"store::CellStore|^<?eval::|^<?calc::|^<?types::|^<?cells::|^<?graph::|^<?formula_slots::|^<?sheet::")


@functools.lru_cache(maxsize=None)
def category(frame):
    name = bare(frame)
    if not ENGINE.search(name):
        return None
    if "FuncAccumulator" in name:
        return "accumulator"
    if name.startswith(("eval::functions::", "<eval::functions::")):
        return "functions"
    if name.endswith("::eval_func"):
        return "eval_func"
    return "other"


def opened(path):
    return gzip.open(path, "rt", errors="replace") if path.endswith(".gz") else open(path, errors="replace")


def main():
    print("profile\tsamples\taccumulator\tfunctions\teval_func\tcall_path")
    for path in sys.argv[1:]:
        counts = collections.Counter()
        total = 0
        with opened(path) as handle:
            temporary = path + ".plain"
            with open(temporary, "w") as plain:
                plain.write(handle.read())
        for frames in samples(temporary):
            total += 1
            for frame in frames:
                found = category(frame)
                if found is not None:
                    counts[found] += 1
                    break
        os.remove(temporary)
        shares = [counts[name] / max(total, 1) for name in ("accumulator", "functions", "eval_func")]
        name = os.path.basename(path).split(".script")[0]
        print(f"{name}\t{total}\t" + "\t".join(f"{share:.4f}" for share in shares) + f"\t{sum(shares):.4f}")


if __name__ == "__main__":
    main()
