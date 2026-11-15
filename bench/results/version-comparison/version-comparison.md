# 0.7.0 against 0.5.4 and 0.6.1

Preliminary: 0.7.0 is develop before the release, Linux at
`87d53bbf50352d19c7a2f94f2329096f4e6d0d1d`, Mac at
`6f20ac05643466e166490000661d1fcb27ec136b` (the two commits differ only in
tests; the packages are built from the same sources). The final numbers come
from a rerun on the release commit. 0.5.4 and 0.6.1 are the published npm
packages. Every number below was measured for this comparison; none is reused
from earlier captures, because those ran each release's own in-repo harness, not
one script against the installed packages.

Raw samples: [`linux.json`](linux.json), [`mac.json`](mac.json). Script:
[`bench/src/version-comparison.ts`](../../src/version-comparison.ts).

| Measure | Engine | Linux 0.5.4 | Linux 0.6.1 | Linux 0.7.0 | Mac 0.5.4 | Mac 0.6.1 | Mac 0.7.0 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Formula recalculation, geomean time of the shared benchmark rows | default | 0.264 ms | 0.153 ms | 0.073 ms | 0.158 ms | 0.082 ms | 0.038 ms |
| Formula recalculation, geomean time of the shared benchmark rows | full | 0.268 ms | 0.149 ms | 0.071 ms | 0.159 ms | 0.082 ms | 0.038 ms |
| Retained memory, 100k formulas | default | 66.6 MiB | 71.5 MiB | 50.3 MiB | 71.4 MiB | 85.5 MiB | 52.3 MiB |
| Retained memory, 100k formulas | full | 64.9 MiB | 65.9 MiB | 46.7 MiB | 70.7 MiB | 84.1 MiB | 46.5 MiB |
| Peak memory, 100k formulas | default | 131.9 MiB | 148.4 MiB | 128.0 MiB | 143.7 MiB | 186.2 MiB | 152.9 MiB |
| Peak memory, 100k formulas | full | 122.1 MiB | 145.1 MiB | 114.3 MiB | 135.3 MiB | 169.8 MiB | 144.4 MiB |
| Engine download, Brotli | default | 263 KiB | 304 KiB | 363 KiB | 263 KiB | 304 KiB | 363 KiB |
| Engine download, Brotli | full | 349 KiB | 423 KiB | 531 KiB | 349 KiB | 423 KiB | 531 KiB |
| XLSX import | default | 2,054 ms | 2,036 ms | 1,975 ms | 1,127 ms | 1,051 ms | 1,025 ms |
| XLSX import | full | 2,108 ms | 1,947 ms | 1,900 ms | 1,142 ms | 1,044 ms | 1,037 ms |
| XLSX export | default | 1,144 ms | 937 ms | 972 ms | 564 ms | 482 ms | 511 ms |
| XLSX export | full | 1,152 ms | 942 ms | 1,031 ms | 570 ms | 476 ms | 515 ms |

Lower is better in every row. Compare versions within one machine; the two
machines are not compared with each other.

## Noise

A/A spread: for each version and engine, the median of the ABC rounds against
the median of the CBA rounds; the largest difference over versions and engines.

| Measure | Linux | Mac |
| --- | ---: | ---: |
| Recalculation geomean | 8.2% | 0.9% |
| Retained memory | 15.0% | 8.1% |
| Peak memory | 4.9% | 2.4% |
| XLSX import | 3.2% | 1.6% |
| XLSX export | 8.6% | 1.1% |

Differences smaller than the spread are not differences. On Linux that covers
0.6.1 against 0.7.0 for XLSX import (both engines) and default-engine export
(+3.6%), the default/full gaps, and 0.5.4 against 0.6.1 for full-engine
retained memory. The Linux full-engine export (+9.5%) is just above the 8.6%
spread. On the Mac, XLSX export is 6% slower in 0.7.0 than in 0.6.1 on the
default engine and 8% on the full engine, both well above the 1.1% spread.

## Machines and method

- Linux: Intel Core i9-12900H, 20 logical CPUs, CachyOS kernel 7.3.0, Bun 1.4.4.
  Run under `bench-run --exclusive` (every benchmark slot and the quiet lock
  held, so no build or other benchmark ran), on all CPUs
  (`taskset -c 0-19`), as the release formula captures do.
- Mac: Apple M5 Pro, 15 logical CPUs, macOS 27.2, Bun 1.4.4. Run under the
  Mac timing lock (`<mac-quiet>`), so no other timing run overlapped.
- 8 rounds per machine. Each round runs every version and engine in fresh
  processes: versions 0.5.4, 0.6.1, 0.7.0 in even rounds and the reverse in odd
  rounds; engines default then full in even rounds, the reverse in odd rounds.
  Tables show the median over rounds.
- Every version is an npm install of `@sheetwrite/core`, `wasm`, `formulas` and
  `xlsx` in its own empty folder. 0.7.0 is the develop commit's built packages,
  packed with `bun pm pack` and installed the same way. The only per-version code
  is the setup call: `initSheetwrite(undefined, engine)` plus
  `registerXlsxBackends()` for 0.5.4 and 0.6.1,
  `initSheetwrite({ engine, addons: [xlsxAddon()] })` for 0.7.0. Each process
  checks it loaded the requested engine (`SUMSQ` computes only on the full
  engine) and records the engine's SHA-256.

**Formula recalculation.** Seven rows from the formula benchmark's topologies,
all through `SheetwriteStore.applyTransaction`. Each row builds its fixture
untimed, edits A1 three times as warm-up, then takes three samples per process;
a sample repeats the edit until 50 ms have passed (at least three edits) and
records the mean per edit. Every sample checks the recalculated value. The
table shows the geometric mean of the row medians. Per-row medians, in ms:

| Row | What the edit of A1 recalculates | Linux 0.5.4 | Linux 0.6.1 | Linux 0.7.0 | Mac 0.5.4 | Mac 0.6.1 | Mac 0.7.0 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| fan-out-100k (default) | 100,000 formulas `=$A$1+n` | 50.57 | 20.67 | 4.423 | 31.75 | 11.33 | 2.662 |
| chain-64 (default) | a 64-cell chain down column A | 0.0522 | 0.0238 | 0.0131 | 0.0324 | 0.0116 | 0.0059 |
| diamond-32 (default) | 32 levels of B/C branches joined in D | 0.0770 | 0.0312 | 0.0199 | 0.0515 | 0.0159 | 0.0106 |
| shared-range-10k (default) | 10,000 formulas `=SUM($A$1:$A$100)` | 5.532 | 2.351 | 0.7271 | 3.250 | 1.183 | 0.4154 |
| distinct-range-10k (default) | 1 of 10,000 ten-row `SUM`s | 0.0242 | 0.0218 | 0.0259 | 0.0167 | 0.0154 | 0.0158 |
| closure-100k (default) | 1 of 100,000 B/C pairs | 0.0056 | 0.0046 | 0.0039 | 0.0026 | 0.0019 | 0.0017 |
| sum-100k (default) | one `=SUM(A1:A100000)` | 0.5832 | 0.5522 | 0.1292 | 0.3290 | 0.3573 | 0.0653 |
| fan-out-100k (full) | | 50.42 | 20.35 | 4.284 | 32.17 | 11.16 | 2.673 |
| chain-64 (full) | | 0.0547 | 0.0228 | 0.0127 | 0.0323 | 0.0116 | 0.0059 |
| diamond-32 (full) | | 0.0822 | 0.0303 | 0.0193 | 0.0518 | 0.0160 | 0.0103 |
| shared-range-10k (full) | | 5.839 | 2.231 | 0.7016 | 3.280 | 1.179 | 0.4279 |
| distinct-range-10k (full) | | 0.0245 | 0.0225 | 0.0252 | 0.0167 | 0.0154 | 0.0157 |
| closure-100k (full) | | 0.0055 | 0.0043 | 0.0039 | 0.0026 | 0.0019 | 0.0017 |
| sum-100k (full) | | 0.5590 | 0.5287 | 0.1217 | 0.3341 | 0.3616 | 0.0651 |

The chain and diamond rows use the formula benchmark's sizes (64 and 32): a
10,000-cell chain gives `#NUM!` in 0.6.1 at its recalculation depth limit.

**Memory.** A separate fresh process loads 100,000 formulas `=An+1` into a
100,000-row store, in 10,000-formula transactions (0.5.4's limit per
transaction). Retained is process RSS after the load minus RSS before it, both
after a forced GC, with the store alive. Peak is the highest RSS during the load
minus RSS before it; a worker thread samples RSS every millisecond, because
Linux updates the kernel's max RSS lazily. Where the kernel max RSS is higher
and the load raised it, that value is used.

**Engine download.** Brotli quality 11 of the engine's `.wasm` plus every JS
file the package's browser entry imports (`loader-browser.mjs`,
`loader-state.mjs`, `pkg/sheetwrite_wasm.js`, `pkg/sheetwrite_wasm_factory.js`),
each compressed on its own. Raw sizes:

| Engine | Part | 0.5.4 | 0.6.1 | 0.7.0 Linux build | 0.7.0 Mac build |
| --- | --- | ---: | ---: | ---: | ---: |
| default | `.wasm` raw | 882,494 B | 1,016,368 B | 1,158,133 B | 1,155,153 B |
| default | `.wasm` Brotli | 257,126 B | 297,998 B | 355,602 B | 354,821 B |
| default | JS raw | 84,894 B | 83,898 B | 105,417 B | 105,417 B |
| default | JS Brotli | 12,577 B | 12,962 B | 16,389 B | 16,389 B |
| full | `.wasm` raw | 1,165,254 B | 1,414,949 B | 1,699,139 B | 1,696,220 B |
| full | `.wasm` Brotli | 345,105 B | 419,914 B | 526,446 B | 526,044 B |
| full | JS raw | 85,207 B | 86,158 B | 113,832 B | 113,832 B |
| full | JS Brotli | 12,650 B | 13,328 B | 17,615 B | 17,615 B |

0.5.4 and 0.6.1 are the published files, identical on both machines. The 0.7.0
`.wasm` is built on each machine, and the two builds differ by under 0.3%.

**XLSX.** A 50,000-row sheet with 6 columns: id and amount numbers, name and
region text, and two formula columns (`=Cn*2`, `=IF(Cn>500,"high","low")`;
100,000 formulas). Export times `toXlsxWorkbook(store.exportSnapshot())` from a
loaded store. Import times `fromXlsxWorkbook(bytes)` plus
`SheetwriteStore.fromSnapshot(snapshot)` and checks a formula value. Every
version imports the same file, the one 0.5.4 writes (1,720,161 bytes, SHA-256
`854a37ee…8025d`), so each reads the same bytes. One warm-up and three samples
per process; the process median, then the median over rounds.

## Rerun on the release commit

```sh
# Per machine, in an empty folder: v0.5.4 and v0.6.1 from npm, v0.7.0 from npm
# once published (or from `bun pm pack` of the release commit's built packages).
bun bench/src/version-comparison.ts run --machine Linux --rounds 8 \
  --version 0.5.4=v0.5.4 --version 0.6.1=v0.6.1 --version 0.7.0=v0.7.0 \
  --commit 0.7.0=<release sha> --output linux.json
# Linux: prefix with `<bench-run> --exclusive taskset -c 0-19`;
# Mac: prefix with `<mac-quiet> <name>` (the timing lock) and use --machine Mac.
bun bench/src/version-comparison.ts report --input linux.json --input mac.json \
  --output table.md
```
