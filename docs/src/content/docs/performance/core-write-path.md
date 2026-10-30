---
title: "Core write path"
description: "Timings of store and document writes at production sizes."
---

<div class="evidence-available"><strong>Validated evidence.</strong> 12 store and document scenarios at production sizes. Every scenario passed its own correctness checkpoint before its timing was accepted.</div>

<dl class="bench-stats" data-pagefind-ignore>
<div><dt>Grid.applyTransaction of a 1,000,000-cell setBlock</dt><dd>545 ms</dd></div>
<div><dt>fromCsv import of 200,000 rows by 10 columns</dt><dd>218 ms</dd></div>
<div><dt>Undo of a 1,000,000-cell clearRange</dt><dd>362 ms</dd></div>
<div><dt>Cold initSheetwrite() through first store in a fresh Node process (7 processes)</dt><dd>6.84 ms</dd></div>
</dl>

<details class="bench-all"><summary>All measurements</summary>

<figure class="bench-viz bench-ruled bench-viz--unlabelled" data-pagefind-ignore style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">scenario</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">10 µs</span><span class="bench-ruler__tick" style="left:20.00%">100 µs</span><span class="bench-ruler__tick" style="left:40.00%">1 ms</span><span class="bench-ruler__tick" style="left:60.00%">10 ms</span><span class="bench-ruler__tick" style="left:80.00%">100 ms</span><span class="bench-ruler__tick" style="left:100.00%">1 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="row-bridge-insert">Row bridge insert<span class="bench-viz__detail">addRows projection of 10,000 rows into a 1,000,000-row bridge</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.47%"></i><i class="bench-bar__fill" style="width:55.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.99 ms</b><b class="bench-num" data-stat="p95">8.38 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="command-state-select">Command state select<span class="bench-viz__detail">4,096-cell range selection on a framework-style grid</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.32%"></i><i class="bench-bar__fill" style="width:59.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">9.84 ms</b><b class="bench-num" data-stat="p95">16.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="with-command-state-handler">With command state handler<span class="bench-viz__detail">Variant of command state select, measured in the same run</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.32%"></i><i class="bench-bar__fill" style="width:59.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">9.84 ms</b><b class="bench-num" data-stat="p95">16.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="without-command-state-handler">Without command state handler<span class="bench-viz__detail">Variant of command state select, measured in the same run</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.89%"></i><i class="bench-bar__fill" style="width:57.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.44 ms</b><b class="bench-num" data-stat="p95">12.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="setblock-admission">Setblock admission<span class="bench-viz__detail">Grid.applyTransaction of a 1,000,000-cell setBlock</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:94.89%"></i><i class="bench-bar__fill" style="width:94.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">545 ms</b><b class="bench-num" data-stat="p95">556 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="setblock-detailed-capture">Setblock detailed capture<span class="bench-viz__detail">Grid.applyTransaction of a 1,000,000-cell setBlock observed through a change listener with detailed capture</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:97.68%"></i><i class="bench-bar__fill" style="width:96.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">657 ms</b><b class="bench-num" data-stat="p95">766 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sync-offline-queue">Sync offline queue<span class="bench-viz__detail">Grid commit admitted into an offline sync queue with no listeners</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:44.01%"></i><i class="bench-bar__fill" style="width:10.21%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.03 ms</b><b class="bench-num" data-stat="p95">1.59 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="rebase-large">Rebase large<span class="bench-viz__detail">Rebase of a 100,000-cell block across 50 single-row inserts</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.81%"></i><i class="bench-bar__fill" style="width:51.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.76 ms</b><b class="bench-num" data-stat="p95">4.90 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="validation-sparse">Validation sparse<span class="bench-viz__detail">100,000-cell sparse setRange with 100 rules outside the range</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:85.20%"></i><i class="bench-bar__fill" style="width:85.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">181 ms</b><b class="bench-num" data-stat="p95">182 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="csv-import">Csv import<span class="bench-viz__detail">fromCsv import of 200,000 rows by 10 columns</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:87.28%"></i><i class="bench-bar__fill" style="width:86.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">218 ms</b><b class="bench-num" data-stat="p95">231 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="undo-large-clear">Undo large clear<span class="bench-viz__detail">Undo of a 1,000,000-cell clearRange</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:92.67%"></i><i class="bench-bar__fill" style="width:91.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">362 ms</b><b class="bench-num" data-stat="p95">430 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="restore-near-ceiling">Restore near ceiling<span class="bench-viz__detail">restoreBlock with 60,000,044 decoded bytes</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:99.05%"></i><i class="bench-bar__fill" style="width:98.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">840 ms</b><b class="bench-num" data-stat="p95">896 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="paged-evicted-revisit">Paged evicted revisit<span class="bench-viz__detail">Revisit of an evicted paged band: scroll back plus a fixed async settle floor (wall time is not the accept metric)</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.91%"></i><i class="bench-bar__fill" style="width:63.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.7 ms</b><b class="bench-num" data-stat="p95">17.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="node-cold-init">Node cold init<span class="bench-viz__detail">Cold initSheetwrite() through first store in a fresh Node process (7 processes)</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.15%"></i><i class="bench-bar__fill" style="width:56.70%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.84 ms</b><b class="bench-num" data-stat="p95">8.08 ms</b></span></div>
</div>
</figure>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-28 17:41 UTC</dd></div>
<div><dt>Commit</dt><dd><code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> clean worktree</dd></div>
<div><dt>Environment</dt><dd>Bun 1.4.4 · Node compatibility v26.3.0 · 12th Gen Intel(R) Core(TM) i9-12900H</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/core-paths-results.json</code></dd></div>
</dl>

## Scale

| Parameter | Value |
| --- | ---: |
| `bridgeRows` | 1,000,000 |
| `bridgeInsertRows` | 10,000 |
| `selectionRows` | 64 |
| `selectionColumns` | 64 |
| `blockRows` | 1,000 |
| `blockColumns` | 1,000 |
| `offlineCommits` | 5,000 |
| `rebaseBlockRows` | 1,000 |
| `rebaseBlockColumns` | 100 |
| `rebaseInsertOperations` | 50 |
| `sparseCells` | 100,000 |
| `validationRules` | 100 |
| `csvRows` | 200,000 |
| `csvColumns` | 10 |
| `clearRows` | 1,000 |
| `clearColumns` | 1,000 |
| `pagedRows` | 200,000 |

## Samples

| Scenario | Samples |
| --- | ---: |
| `row-bridge-insert` | 2 |
| `command-state-select` | 10 |
| `with-command-state-handler` | 10 |
| `without-command-state-handler` | 10 |
| `setblock-admission` | 3 |
| `setblock-detailed-capture` | 3 |
| `sync-offline-queue` | 5000 |
| `rebase-large` | 3 |
| `validation-sparse` | 3 |
| `csv-import` | 2 |
| `undo-large-clear` | 3 |
| `restore-near-ceiling` | 3 |
| `paged-evicted-revisit` | 3 |
| `node-cold-init` | 6 |

## Counters

Non-time evidence recorded by the same runs.

| Scenario | Counter | Value |
| --- | --- | ---: |
| `row-bridge-insert` | `bridgeRows` | 1,000,000 |
| `row-bridge-insert` | `insertedRows` | 10,000 |
| `command-state-select` | `selectedCells` | 4,096 |
| `command-state-select` | `commandStateEvents` | 13 |
| `command-state-select` | `withoutHandlerMedianMs` | 7.436 |
| `setblock-admission` | `blockCells` | 1,000,000 |
| `setblock-admission` | `transactions` | 4 |
| `setblock-detailed-capture` | `blockCells` | 1,000,000 |
| `setblock-detailed-capture` | `transactions` | 4 |
| `setblock-detailed-capture` | `capturedChanges` | 1,000,000 |
| `setblock-detailed-capture` | `validatedCapturedChanges` | 1,000,000 |
| `sync-offline-queue` | `queuedCommits` | 5,005 |
| `sync-offline-queue` | `admittedOperations` | 5,005 |
| `rebase-large` | `blockCells` | 100,000 |
| `rebase-large` | `insertOperations` | 50 |
| `rebase-large` | `verifiedValues` | 100,000 |
| `validation-sparse` | `writtenCells` | 100,000 |
| `validation-sparse` | `logicalRangeCells` | 1,000,000 |
| `validation-sparse` | `validationRules` | 100 |
| `csv-import` | `importedRows` | 200,000 |
| `csv-import` | `importedColumns` | 10 |
| `csv-import` | `verifiedCells` | 2,000,000 |
| `csv-import` | `inputChars` | 20,888,985 |
| `undo-large-clear` | `clearedCells` | 1,000,000 |
| `undo-large-clear` | `clears` | 4 |
| `undo-large-clear` | `restoredCells` | 1,000,000 |
| `undo-large-clear` | `compactRestores` | 5 |
| `undo-large-clear` | `peakRssBytes` | 1,099,108,352 |
| `restore-near-ceiling` | `restoredCells` | 4,000,000 |
| `restore-near-ceiling` | `decodedBytes` | 60,000,044 |
| `restore-near-ceiling` | `peakRssBytes` | 1,445,208,064 |
| `paged-evicted-revisit` | `revisitedRows` | 3 |
| `paged-evicted-revisit` | `areColumnsFullyLoadedCalls` | 108 |
| `paged-evicted-revisit` | `evictionVisits` | 3 |
| `paged-evicted-revisit` | `pagedRows` | 200,000 |
| `node-cold-init` | `largestHeartbeatGapMs` | 6.63 |
| `node-cold-init` | `minimalHeartbeatTicks` | 1 |
| `node-cold-init` | `freshProcesses` | 7 |

## Correctness checkpoints

| Scenario | Checkpoint |
| --- | --- |
| `row-bridge-insert` | projected delta is one row-structure insert with every created identity present in the bridge in order |
| `command-state-select` | selection covers 4096 cells and the command-state handler observes one event per selection |
| `setblock-admission` | every setBlock is applied and every cell of the block holds the last written value |
| `setblock-detailed-capture` | every setBlock is applied and every cell of the block holds the last written value, and its change capture reports every cell's address, previous value, and new value exactly once |
| `sync-offline-queue` | every commit is applied, the queue holds every commit at server version 0, and capacity stays available |
| `rebase-large` | the block rebases without conflict, shifts down by exactly the inserted row count, keeps every source value, and leaves the caller's operations untouched |
| `validation-sparse` | every write is applied, probe cells hold the last written values, every rule is retained, and a rule violation is still rejected |
| `csv-import` | row count matches and every imported cell equals the source value for its row and column, including declared number/text types |
| `undo-large-clear` | the clear empties the block and the undos restore every original cell value |
| `restore-near-ceiling` | a valid near-ceiling compressed restore applies its complete block |
| `paged-evicted-revisit` | the band is unloaded before each revisit, the revisit reloads it with the source values, and the revisit asks areColumnsFullyLoaded at least once; areColumnsFullyLoadedCalls per revisit is the accept metric |
| `node-cold-init` | every fresh process loads the module, produces the expected engine result, and reports a plausible heartbeat gap |

</details>

Reproduce with:

```sh verify title="Core write-path evidence"
bun run --filter @sheetwrite/bench bench:core-paths
```
