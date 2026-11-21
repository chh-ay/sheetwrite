import type { Grid } from "@sheetwrite/core";
import type { SheetwriteStore } from "@sheetwrite/core";
import type { SyncCoordinator } from "@sheetwrite/core";
import type { GridConfig } from "@sheetwrite/core";
import type { GridActions } from "@sheetwrite/core";
import type { ChartViewProvider } from "@sheetwrite/core";
import type { Store } from "@sheetwrite/core";
import type { KeyboardOptions } from "@sheetwrite/core";
import type { WorkbookTable } from "@sheetwrite/core";
import type { RowBridge } from "@sheetwrite/core";
import type { HistoryDiffCells } from "@sheetwrite/core/history";
import type { HistoryArchive } from "@sheetwrite/core/history";
import type { Workbook } from "@sheetwrite/core";
import type { Column } from "@sheetwrite/core";
import type { Sheet } from "@sheetwrite/core";
import type { PendingCommit } from "@sheetwrite/core";
import type { VersionedOperation } from "@sheetwrite/core";
import type { PersistenceAdapter } from "@sheetwrite/core";
import type { MemoryPersistenceAdapter } from "@sheetwrite/core";
import type { HistoryArchiveOptions } from "@sheetwrite/core/history";
import type { DataValidationRule } from "@sheetwrite/core";
import type { ProtectedRange } from "@sheetwrite/core";
import type { GridOptions } from "@sheetwrite/core";
import type { SheetSnapshot } from "@sheetwrite/core";
import type { CellStyle } from "@sheetwrite/core";
import type { CellBorders } from "@sheetwrite/core";
import type { Range } from "@sheetwrite/core";
import type { DelimitedTextOptions } from "@sheetwrite/core";
import type { CellStore } from "@sheetwrite/formulas";
import type { SourceSnapshot } from "@sheetwrite/formulas";
import type { RangeSnapshot } from "@sheetwrite/formulas";
import type { SimpleColumn } from "@sheetwrite/core/adapter";
import type { DataSourceStorageOptions } from "@sheetwrite/core";
import type { SheetwriteStoreOptions } from "@sheetwrite/core";
import type { SnapshotValidationOptions } from "@sheetwrite/core";
import type { SnapshotGridOptions } from "@sheetwrite/core";
import type { SyncCoordinatorOptions } from "@sheetwrite/core";
import type { PresenceCoordinatorOptions } from "@sheetwrite/core";
import type { XlsxWorkbookOptions } from "@sheetwrite/core";
import type { ChangeEvent } from "@sheetwrite/core";
import type { ChartView } from "@sheetwrite/charts";
import type { DiffKernel } from "@sheetwrite/wasm/history";
import type { WindowView } from "@sheetwrite/formulas";
import type { XlsxFormulaEngine } from "@sheetwrite/core";
import type { RowBridgeMetadataDelta } from "@sheetwrite/core";
type _0 = Grid["aggregate"]; // api/core/aggregate-op.md:8
type _1 = Grid["applyTransaction"]; // api/core/cell-input-snapshot.md:10
type _2 = Grid["getCellInput"]; // api/core/cell-input-snapshot.md:12
type _3 = ChartViewProvider["subscribe"]; // api/core/chart-change-listener.md:8
type _4 = Grid["actions"]; // api/core/grid-actions.md:8
type _5 = Grid["openPanel"]; // api/core/grid-panel.md:8
type _6 = Store["applyTransaction"]; // api/core/grid.md:425
// api/core/grid.md:1769 /* not exported */ destroy
type _8 = KeyboardOptions["bindings"]; // api/core/key-bindings.md:9
({} as GridConfig).keyboard; // api/core/keyboard-settings-options.md:15
type _10 = WorkbookTable["id"]; // api/core/pivot-source.md:12
type _11 = RowBridge["reconcile"]; // api/core/row-bridge-reconciliation-input.md:8
type _12 = SyncCoordinator["recoverConflict"]; // api/core/sync-conflict-recovery.md:8
type _13 = Store["getVisibleWindow"]; // api/core/visible-window-view.md:8
type _14 = Store["getCell"]; // api/core/visible-window-view.md:10
type _15 = HistoryDiffCells["flags"]; // api/core-history/history-diff-flag.md:8
type _16 = HistoryArchive["restoreVersion"]; // api/core-history/history-restore-options.md:8
type _17 = Grid["goToCell"]; // api/core-shell/create-name-box.md:13
({} as Grid).actions; // api/core-shell/create-ribbon.md:9
// api/core-testing/install-canvas-test-stubs.md:13 /* not exported */ getContext
({} as Grid).exportXlsx; // api/xlsx/xlsx-addon.md:13
({} as SheetwriteStore).getCell; // concepts/calculation-engine.md:34
type _22 = Workbook["activeSheet"]; // concepts/documents-and-operations.md:81
// concepts/error-handling.md:19 /* not exported */ toJSON
({} as Grid).rendererKind; // concepts/error-handling.md:134
// concepts/error-handling.md:143 /* not exported */ setReadOnly
// concepts/runtime-ownership.mdx:94 /* not exported */ getVisibleWindow
// concepts/runtime-ownership.mdx:95 /* not exported */ getCell
type _28 = Column["header"]; // features/accessibility.md:102
({} as Grid).refresh; // features/accessibility.md:116
// features/analysis/charts.md:105 /* not exported */ setChart
// features/analysis/charts.md:124 /* not exported */ getCharts
// features/analysis/charts.md:125 /* not exported */ removeChart
// features/analysis/charts.md:126 /* not exported */ selectChart
type _34 = Sheet["charts"]; // features/analysis/charts.md:231
({} as GridActions).newDashboard; // features/analysis/dashboards.mdx:38
// features/analysis/dashboards.mdx:193 /* not exported */ getDashboard
// features/analysis/dashboards.mdx:194 /* not exported */ setDashboardItem
// features/analysis/dashboards.mdx:195 /* not exported */ removeDashboardItem
// features/analysis/data-model.mdx:110 /* not exported */ getRelationships
// features/analysis/data-model.mdx:111 /* not exported */ setRelationship
// features/analysis/data-model.mdx:112 /* not exported */ removeRelationship
// features/analysis/data-model.mdx:113 /* not exported */ getRelationshipStatus
// features/analysis/data-model.mdx:213 /* not exported */ getMeasures
// features/analysis/data-model.mdx:214 /* not exported */ setMeasure
// features/analysis/data-model.mdx:215 /* not exported */ removeMeasure
// features/analysis/data-model.mdx:216 /* not exported */ getMeasureStatus
({} as GridActions).showPivotFields; // features/analysis/pivot-tables.md:119
// features/analysis/pivot-tables.md:178 /* not exported */ getPivots
// features/analysis/pivot-tables.md:180 /* not exported */ getPivotFields
// features/analysis/pivot-tables.md:183 /* not exported */ getPivotResult
({} as SyncCoordinator).pendingCommits; // features/collaboration.mdx:28
// features/collaboration.mdx:31 /* not exported */ flush
// features/collaboration.mdx:155 /* not exported */ commit
// features/collaboration.mdx:167 /* not exported */ commitBatch
// features/collaboration.mdx:227 /* not exported */ setOnline
type _56 = PendingCommit["authorId"]; // features/collaboration.mdx:255
type _57 = VersionedOperation["authorId"]; // features/collaboration.mdx:259
type _58 = SyncCoordinator["subscribe"]; // features/collaboration.mdx:280
type _59 = Grid["applyRemoteOperations"]; // features/collaboration.mdx:280
// features/collaboration.mdx:285 /* not exported */ resumeAfterReload
({} as SyncCoordinator).recoverConflict; // features/collaboration.mdx:292
({} as SyncCoordinator).flush; // features/collaboration.mdx:297
({} as SyncCoordinator).ready; // features/collaboration.mdx:408
// features/collaboration.mdx:408 /* not exported */ pendingCommits
({} as SyncCoordinator).subscribe; // features/collaboration.mdx:413
type _66 = PendingCommit["restore"]; // features/collaboration.mdx:435
// features/collaboration.mdx:435 /* not exported */ recoverConflict
type _68 = HistoryArchive["listVersions"]; // features/collaboration.mdx:443
type _69 = HistoryArchive["readVersion"]; // features/collaboration.mdx:444
type _70 = PersistenceAdapter["commit"]; // features/collaboration.mdx:445
type _71 = HistoryArchive["initialize"]; // features/collaboration.mdx:449
({} as Grid).setAutoFilter; // features/data/autofilter.md:14
({} as GridActions).toggleAutoFilter; // features/data/autofilter.md:14
({} as Grid).setColumnFilter; // features/data/autofilter.md:39
({} as Grid).reapplyFilter; // features/data/autofilter.md:77
({} as GridActions).clearFilters; // features/data/autofilter.md:77
({} as GridActions).pasteVisibleRows; // features/data/autofilter.md:87
({} as Grid).canPasteVisibleRows; // features/data/autofilter.md:87
({} as Grid).sortRange; // features/data/data-operations.md:59
({} as SheetwriteStore).sortRange; // features/data/data-operations.md:59
({} as Grid).sortBy; // features/data/data-operations.md:66
// features/data/data-operations.md:149 /* not exported */ sortBy
// features/data/data-operations.md:150 /* not exported */ sortRange
// features/data/data-operations.md:151 /* not exported */ setViewSort
// features/data/data-operations.md:152 /* not exported */ filterBy
// features/data/data-operations.md:153 /* not exported */ setColumnFilter
// features/data/data-operations.md:154 /* not exported */ getColumnFilters
// features/data/data-operations.md:155 /* not exported */ setAutoFilter
// features/data/data-operations.md:156 /* not exported */ reapplyFilter
// features/data/data-operations.md:157 /* not exported */ distinctValues
// features/data/data-operations.md:158 /* not exported */ hideRows
// features/data/data-operations.md:158 /* not exported */ showRows
// features/data/data-operations.md:159 /* not exported */ hiddenRows
// features/data/data-operations.md:160 /* not exported */ groupRows
// features/data/data-operations.md:160 /* not exported */ ungroupRows
// features/data/data-operations.md:161 /* not exported */ setGroupCollapsed
// features/data/data-operations.md:162 /* not exported */ rowGroups
// features/data/data-operations.md:163 /* not exported */ clearView
// features/data/data-operations.md:205 /* not exported */ setFrozen
// features/data/data-operations.md:206 /* not exported */ setZoom
({} as Grid).destroy; // features/data/data-operations.md:312
// features/data/datasources.md:107 /* not exported */ getCellLoadState
({} as Grid).applyRemoteOperations; // features/data/host-owned-rows.md:116
({} as SyncCoordinator).sendNext; // features/data/persistence.md:32
type _105 = PersistenceAdapter["load"]; // features/data/persistence.md:46
type _106 = PersistenceAdapter["commitBatch"]; // features/data/persistence.md:48
({} as Grid).exportSnapshot; // features/data/persistence.md:65
({} as SyncCoordinator).retry; // features/data/persistence.md:68
type _109 = HistoryArchive["open"]; // features/data/persistence.md:90
type _110 = MemoryPersistenceAdapter["recordHistory"]; // features/data/persistence.md:96
// features/data/persistence.md:108 /* not exported */ initialize
// features/data/persistence.md:109 /* not exported */ record
// features/data/persistence.md:110 /* not exported */ saveVersion
// features/data/persistence.md:111 /* not exported */ listVersions
// features/data/persistence.md:112 /* not exported */ readVersion
// features/data/persistence.md:113 /* not exported */ diffVersions
// features/data/persistence.md:114 /* not exported */ prune
// features/data/persistence.md:115 /* not exported */ deleteVersion
// features/data/persistence.md:116 /* not exported */ storageUsage
type _120 = HistoryArchiveOptions["limits"]; // features/data/persistence.md:143
({} as Grid).getNote; // features/data/validation-protection-and-notes.md:42
({} as GridActions).dataValidation; // features/data/validation-protection-and-notes.md:54
// features/data/validation-protection-and-notes.md:114 /* not exported */ setNote
// features/data/validation-protection-and-notes.md:114 /* not exported */ getNote
type _125 = DataValidationRule["inCellDropdown"]; // features/data/validation-protection-and-notes.md:122
type _126 = DataValidationRule["policy"]; // features/data/validation-protection-and-notes.md:123
type _127 = DataValidationRule["allowBlank"]; // features/data/validation-protection-and-notes.md:124
type _128 = DataValidationRule["errorStyle"]; // features/data/validation-protection-and-notes.md:125
type _129 = DataValidationRule["errorTitle"]; // features/data/validation-protection-and-notes.md:126
type _130 = DataValidationRule["inputTitle"]; // features/data/validation-protection-and-notes.md:127
type _131 = DataValidationRule["showInputMessage"]; // features/data/validation-protection-and-notes.md:128
type _132 = ProtectedRange["label"]; // features/data/validation-protection-and-notes.md:129
type _133 = GridOptions["protectionResolver"]; // features/data/validation-protection-and-notes.md:130
({} as Grid).setProtectionResolver; // features/data/validation-protection-and-notes.md:130
type _135 = GridOptions["mutationPolicy"]; // features/data/validation-protection-and-notes.md:131
({} as Grid).setNote; // features/data/validation-protection-and-notes.md:132
({} as Grid).setConditionalFormats; // features/formatting/conditional-formats.md:105
type _138 = Sheet["conditionalFormats"]; // features/formatting/conditional-formats.md:128
type _139 = SheetSnapshot["conditionalFormats"]; // features/formatting/conditional-formats.md:128
// features/formatting/fonts-and-alignment.md:129 /* not exported */ setFontFamily
// features/formatting/fonts-and-alignment.md:130 /* not exported */ setFontSize
// features/formatting/fonts-and-alignment.md:131 /* not exported */ stepFontSize
// features/formatting/fonts-and-alignment.md:132 /* not exported */ setVerticalAlign
// features/formatting/fonts-and-alignment.md:133 /* not exported */ toggleWrap
// features/formatting/fonts-and-alignment.md:134 /* not exported */ setAlign
// features/formatting/fonts-and-alignment.md:135 /* not exported */ toggleBold
// features/formatting/fonts-and-alignment.md:135 /* not exported */ toggleItalic
// features/formatting/fonts-and-alignment.md:135 /* not exported */ toggleUnderline
// features/formatting/fonts-and-alignment.md:135 /* not exported */ toggleStrikethrough
type _150 = CellStyle["align"]; // features/formatting/fonts-and-alignment.md:189
// features/formatting/number-formats.md:143 /* not exported */ setNumberFormat
// features/formatting/number-formats.md:143 /* not exported */ stepDecimals
({} as GridActions).formatCells; // features/formatting/number-formats.md:161
({} as Grid).setTheme; // features/formatting/styles.md:89
({} as Grid).replaceTheme; // features/formatting/styles.md:150
({} as Grid).getEffectiveTheme; // features/formatting/styles.md:151
({} as Grid).getTheme; // features/formatting/styles.md:152
// features/formatting/styles.md:164 /* not exported */ replaceTheme
({} as Grid).css; // features/formatting/styles.md:190
({} as Grid).openPanel; // features/formatting/styles.md:198
// features/formatting/styles.md:220 /* not exported */ url
type _162 = Column["cellStyle"]; // features/formatting/styles.md:302
type _163 = Column["headerStyle"]; // features/formatting/styles.md:303
type _164 = CellBorders["all"]; // features/formatting/styles.md:344
({} as SheetwriteStore).getFormula; // features/formulas/authoring-and-references.md:84
type _166 = Grid["setHyperlink"]; // features/formulas/authoring-and-references.md:249
({} as SheetwriteStore).recalculateVolatile; // features/formulas/custom-functions.md:139
({} as SheetwriteStore).getSpillAnchor; // features/formulas/dynamic-arrays-and-spills.md:104
type _169 = GridConfig["contextMenu"]; // features/grid/context-menu.md:6
({} as Grid).setConfig; // features/grid/context-menu.md:33
// features/grid/context-menu.md:80 /* not exported */ onClick
({} as Grid).getCellAtPoint; // features/grid/context-menu.md:94
({} as Grid).highlightCells; // features/grid/context-menu.md:111
({} as Grid).styleRange; // features/grid/context-menu.md:125
type _175 = Grid["getCellAtPoint"]; // features/grid/context-menu.md:143
type _176 = Column["editor"]; // features/grid/custom-editors.md:6
type _177 = GridOptions["editors"]; // features/grid/custom-editors.md:6
// features/grid/custom-editors.md:79 /* not exported */ mount
// features/grid/custom-editors.md:83 /* not exported */ cancel
// features/grid/custom-editors.md:85 /* not exported */ update
// features/grid/custom-editors.md:86 /* not exported */ reposition
// features/grid/editing-and-clipboard.md:65 /* not exported */ beginEdit
// features/grid/editing-and-clipboard.md:65 /* not exported */ undo
// features/grid/editing-and-clipboard.md:65 /* not exported */ redo
({} as Grid).getCellMode; // features/grid/editing-and-clipboard.md:75
({} as GridActions).pickFromList; // features/grid/editing-and-clipboard.md:120
// features/grid/editing-and-clipboard.md:149 /* not exported */ paste
// features/grid/editing-and-clipboard.md:149 /* not exported */ pasteValues
({} as GridActions).pasteSpecial; // features/grid/editing-and-clipboard.md:183
type _190 = Range["PasteSpecial"]; // features/grid/editing-and-clipboard.md:183
// features/grid/editing-and-clipboard.md:207 /* not exported */ pasteSpecial
({} as GridActions).copy; // features/grid/editing-and-clipboard.md:211
({} as Grid).undo; // features/grid/editing-and-clipboard.md:230
({} as Grid).redo; // features/grid/editing-and-clipboard.md:230
({} as Grid).beginEdit; // features/grid/editing-and-clipboard.md:260
({} as GridActions).paste; // features/grid/editing-and-clipboard.md:261
// features/grid/grid-methods.md:135 /* not exported */ merge
// features/grid/grid-methods.md:135 /* not exported */ exportCsv
// features/grid/grid-methods.md:136 /* not exported */ setActiveSheet
// features/grid/grid-methods.md:137 /* not exported */ addSheet
// features/grid/grid-methods.md:137 /* not exported */ copySheet
// features/grid/grid-methods.md:137 /* not exported */ moveSheet
// features/grid/grid-methods.md:137 /* not exported */ setSheetTabColor
// features/grid/grid-methods.md:139 /* not exported */ insertRows
// features/grid/grid-methods.md:139 /* not exported */ removeRows
// features/grid/grid-methods.md:139 /* not exported */ insertColumns
// features/grid/grid-methods.md:139 /* not exported */ removeColumns
// features/grid/grid-methods.md:140 /* not exported */ styleRange
// features/grid/grid-methods.md:141 /* not exported */ setValidationRule
// features/grid/grid-methods.md:141 /* not exported */ removeValidationRule
// features/grid/grid-methods.md:142 /* not exported */ setProtectedRange
// features/grid/grid-methods.md:142 /* not exported */ removeProtectedRange
// features/grid/grid-methods.md:142 /* not exported */ setProtectionResolver
// features/grid/grid-methods.md:144 /* not exported */ exportXlsx
// features/grid/grid-methods.md:150 /* not exported */ getSelection
// features/grid/grid-methods.md:150 /* not exported */ setSelection
// features/grid/grid-methods.md:151 /* not exported */ scrollToCell
// features/grid/grid-methods.md:153 /* not exported */ dataEdge
// features/grid/grid-methods.md:154 /* not exported */ search
// features/grid/grid-methods.md:155 /* not exported */ findNext
// features/grid/grid-methods.md:155 /* not exported */ findPrev
// features/grid/grid-methods.md:156 /* not exported */ clearSearch
// features/grid/grid-methods.md:157 /* not exported */ replaceCurrent
// features/grid/grid-methods.md:157 /* not exported */ replaceAll
// features/grid/grid-methods.md:158 /* not exported */ highlightCells
// features/grid/grid-methods.md:164 /* not exported */ aggregate
// features/grid/grid-methods.md:168 /* not exported */ getAutoFilter
// features/grid/grid-methods.md:171 /* not exported */ sheetRowOf
// features/grid/grid-methods.md:171 /* not exported */ viewRowOf
// features/grid/grid-methods.md:172 /* not exported */ goToCell
// features/grid/grid-methods.md:172 /* not exported */ getActiveSheetCell
// features/grid/grid-methods.md:172 /* not exported */ getActiveCellInput
// features/grid/grid-methods.md:173 /* not exported */ hideColumns
// features/grid/grid-methods.md:173 /* not exported */ showColumns
// features/grid/grid-methods.md:173 /* not exported */ hiddenColumns
// features/grid/grid-methods.md:182 /* not exported */ getZoom
// features/grid/grid-methods.md:183 /* not exported */ setRowHeight
// features/grid/grid-methods.md:183 /* not exported */ setColumnWidth
// features/grid/grid-methods.md:184 /* not exported */ autoFitRows
// features/grid/grid-methods.md:184 /* not exported */ autoFitColumns
// features/grid/grid-methods.md:185 /* not exported */ setTheme
// features/grid/grid-methods.md:186 /* not exported */ defineCellRenderer
// features/grid/grid-methods.md:192 /* not exported */ on
// features/grid/grid-methods.md:193 /* not exported */ refresh
// features/grid/grid-methods.md:200 /* not exported */ applyTransaction
// features/grid/grid-methods.md:201 /* not exported */ exportSnapshot
// features/grid/grid-methods.md:201 /* not exported */ applyRemoteOperations
// features/grid/grid-methods.md:202 /* not exported */ getCommandState
// features/grid/grid-methods.md:203 /* not exported */ getFocusCellStyle
// features/grid/grid-methods.md:204 /* not exported */ getCellAtPoint
// features/grid/grid-methods.md:205 /* not exported */ setConfig
({} as Grid).openKeyboardSettings; // features/grid/keyboard-shortcuts.md:97
type _253 = Column["renderer"]; // features/grid/options-and-presentation.md:90
({} as Grid).defineCellRenderer; // features/grid/options-and-presentation.md:131
type _255 = Range["Merge"]; // features/grid/resize-merge-and-fill.md:70
({} as GridActions).merge; // features/grid/resize-merge-and-fill.md:70
({} as GridActions).unmerge; // features/grid/resize-merge-and-fill.md:70
// features/grid/resize-merge-and-fill.md:82 /* not exported */ mergeAndCenter
({} as Grid).setColumnWidth; // features/grid/resize-merge-and-fill.md:146
({} as Grid).setRowHeight; // features/grid/resize-merge-and-fill.md:147
({} as GridActions).mergeAndCenter; // features/grid/resize-merge-and-fill.md:149
({} as Grid).search; // features/grid/search.md:6
({} as GridConfig).find; // features/grid/search.md:59
// features/grid/search.md:89 /* not exported */ selectMatch
({} as Grid).setSelection; // features/grid/selection-and-keyboard.md:62
({} as GridActions).insertCells; // features/grid/selection-and-keyboard.md:138
({} as GridActions).deleteCells; // features/grid/selection-and-keyboard.md:138
type _268 = Range["Insert"]; // features/grid/selection-and-keyboard.md:138
type _269 = Range["Delete"]; // features/grid/selection-and-keyboard.md:138
({} as Grid).getShortcutLabel; // features/grid/selection-and-keyboard.md:163
({} as Grid).summarizeSelection; // features/grid/status-bar.md:121
type _272 = Grid["summarizeSelection"]; // features/grid/status-bar.md:171
// features/grid/toolbar-and-ribbon.md:202 /* not exported */ import
type _274 = GridConfig["ribbon"]; // features/grid/toolbar-and-ribbon.md:230
({} as GridActions).setTextColor; // features/grid/toolbar-and-ribbon.md:310
({} as GridActions).setBorders; // features/grid/toolbar-and-ribbon.md:311
({} as GridActions).exportXlsx; // features/grid/toolbar-and-ribbon.md:323
({} as Grid).getCommandState; // features/grid/toolbar-and-ribbon.md:328
// features/worker-rendering.md:76 /* not exported */ transferControlToOffscreen
({} as Grid).on; // frameworks/vanilla.mdx:55
({} as Grid).exportCsv; // import-export/csv-and-tsv.md:63
// import-export/large-files-and-streaming.md:34 /* not exported */ arrayBuffer
type _283 = DelimitedTextOptions["signal"]; // import-export/large-files-and-streaming.md:112
type _284 = SheetwriteStore["fromSnapshot"]; // import-export/xlsx-import.md:129
({} as Grid).activateHyperlink; // import-export/xlsx-import.md:143
({} as Grid).trimMemory; // performance/memory.md:26
// performance/memory.md:51 /* not exported */ compactStringStorage
// performance/memory.md:51 /* not exported */ stringPoolEpoch
type _289 = CellStore["setBlock"]; // reference/api-contract.md:45
type _290 = CellStore["setBlockPacked"]; // reference/api-contract.md:45
type _291 = CellStore["sortRows"]; // reference/api-contract.md:46
type _292 = CellStore["canDirtyCell"]; // reference/api-contract.md:47
type _293 = SourceSnapshot["byteLength"]; // reference/api-contract.md:48
type _294 = RangeSnapshot["byteLength"]; // reference/api-contract.md:48
type _295 = CellStore["setSparseBlock"]; // reference/api-contract.md:49
// reference/api-contract.md:50 /* not exported */ types
// reference/api-contract.md:50 /* not exported */ takeNames
// reference/api-contract.md:50 /* not exported */ takeTypes
type _299 = GridOptions["overscan"]; // reference/compatibility-limits.md:28
({} as Grid).setOverscan; // reference/compatibility-limits.md:28
type _301 = SimpleColumn["width"]; // reference/compatibility-limits.md:32
type _302 = DataSourceStorageOptions["chunkRows"]; // reference/compatibility-limits.md:33
type _303 = SheetwriteStoreOptions["chunkRows"]; // reference/compatibility-limits.md:33
type _304 = DataSourceStorageOptions["cacheBytes"]; // reference/compatibility-limits.md:34
type _305 = SheetwriteStoreOptions["cacheBytes"]; // reference/compatibility-limits.md:34
type _306 = DataSourceStorageOptions["dirtyCellLimit"]; // reference/compatibility-limits.md:35
type _307 = SheetwriteStoreOptions["dirtyCellLimit"]; // reference/compatibility-limits.md:35
type _308 = Grid["distinctValues"]; // reference/compatibility-limits.md:36
type _309 = GridOptions["transactionResourceLimits"]; // reference/compatibility-limits.md:65
type _310 = SheetwriteStoreOptions["transactionResourceLimits"]; // reference/compatibility-limits.md:65
type _311 = SnapshotValidationOptions["resourceLimits"]; // reference/compatibility-limits.md:84
type _312 = SheetwriteStoreOptions["snapshotResourceLimits"]; // reference/compatibility-limits.md:84
type _313 = SnapshotGridOptions["snapshotResourceLimits"]; // reference/compatibility-limits.md:84
type _314 = SyncCoordinatorOptions["limits"]; // reference/compatibility-limits.md:113
type _315 = PresenceCoordinatorOptions["heartbeatMs"]; // reference/compatibility-limits.md:135
type _316 = PresenceCoordinatorOptions["timeoutMs"]; // reference/compatibility-limits.md:136
type _317 = PresenceCoordinatorOptions["maxActors"]; // reference/compatibility-limits.md:137
type _318 = PresenceCoordinatorOptions["maxRangesPerActor"]; // reference/compatibility-limits.md:138
type _319 = XlsxWorkbookOptions["maxCells"]; // reference/compatibility-limits.md:144
type _320 = XlsxWorkbookOptions["resourceLimits"]; // reference/compatibility-limits.md:144
({} as Grid).applyTransaction; // reference/document-operations.md:10
({} as SheetwriteStore).applyTransaction; // reference/document-operations.md:10
// reference/events.md:6 /* not exported */ off
type _324 = ChangeEvent["source"]; // reference/events.md:20
({} as SyncCoordinator).on; // reference/events.md:49
type _326 = SyncCoordinatorOptions["authorId"]; // releases/0.7.0.mdx:185
({} as GridConfig).ribbon; // releases/0.7.0.mdx:209
({} as Grid).importWorkbook; // releases/0.7.0.mdx:211
({} as Grid).sheetRowOf; // releases/0.7.0.mdx:216
({} as Grid).viewRowOf; // releases/0.7.0.mdx:216
({} as GridConfig).keyboardSettings; // releases/0.7.0.mdx:251
({} as SheetwriteStore).sortBy; // releases/0.7.0.mdx:406
({} as SheetwriteStore).sortByMulti; // releases/0.7.0.mdx:406
({} as Grid).setSort; // releases/0.7.0.mdx:406
({} as Grid).sortByMulti; // releases/0.7.0.mdx:406
type _336 = ChartView["chart"]; // releases/0.7.0.mdx:440
({} as Grid).getCharts; // releases/0.7.0.mdx:441
({} as Grid).setChart; // releases/0.7.0.mdx:442
type _339 = CellStore["setColumnNumbers"]; // releases/0.7.0.mdx:451
type _340 = DiffKernel["clearPage"]; // releases/0.7.0.mdx:452
type _341 = DiffKernel["pageLength"]; // releases/0.7.0.mdx:453
type _342 = CellStore["rowCount"]; // releases/0.7.0.mdx:455
type _343 = WindowView["nRows"]; // releases/0.7.0.mdx:456
type _344 = XlsxFormulaEngine["convert"]; // releases/0.7.0.mdx:488
// start/upgrade-to-0-6-0.md:19 /* not exported */ recalculateVolatile
({} as Grid).setViewSort; // start/upgrade-to-0-7-0.md:27
({} as SheetwriteStore).setViewSort; // start/upgrade-to-0-7-0.md:30
type _348 = RowBridgeMetadataDelta["metadata"]; // start/upgrade-to-0-7-0.md:166
// start/upgrade-to-0-7-0.md:226 /* not exported */ registerChartsBackend
// start/upgrade-to-0-7-0.md:227 /* not exported */ registerXlsxBackends
// start/upgrade-to-0-7-0.md:409 /* not exported */ setSparseBlock
// start/upgrade-to-0-7-0.md:414 /* not exported */ setSheetName
type _353 = Sheet["sortState"]; // start/upgrade-to-0-7-0.md:713
({} as GridActions).find; // start/upgrade-to-0-7-0.md:751
({} as Grid).getFocusCellStyle; // start/upgrade-to-0-7-0.md:754
type _356 = Column["type"]; // start/upgrade-to-0-7-0.md:763
type _357 = SheetwriteStore["applyTransaction"]; // start/upgrade-to-0-7-0.md:776
({} as Grid).config; // tutorials/spreadsheet-app-with-ribbon.md:128
export {};
