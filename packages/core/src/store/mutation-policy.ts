import { restoreBlockFacts } from "../restore-block.js";
import type { CellValue } from "../types/cell.js";
import type { Range, SheetId } from "../types/coordinates.js";
import type {
  CommitReason,
  DataValidationRule,
  DocumentOp,
  MutationIssue,
  MutationPolicyMode,
  ProtectedRange,
  ProtectionResolver,
  Sheet,
  Workbook,
} from "../types/document.js";
import type { PivotDefinition } from "../types/pivot.js";
import {
  ValidationBudgetError,
  validationAccepts,
  validationIssueMessage,
  type ValidationReads,
} from "../validation-rule.js";
import {
  cellRange,
  fullSheetRange,
  movedCellBounds,
  normalizedRange,
  patchSheetId,
  pivotWrittenRange,
  rangeContains,
  rangesIntersect,
} from "./ranges.js";

export interface MutationPolicyResult {
  readonly patches: DocumentOp[];
  readonly warnings: MutationIssue[];
  readonly rejections: MutationIssue[];
}

/** Rendered pivot output rectangles on one sheet. */
export type PivotOutputProvider = (sheet: SheetId) => ReadonlyArray<{ id: string; range: Range }>;

/**
 * Decides from workbook metadata which operations of a transaction may apply.
 * It does not write to the store or emit events.
 */
export class StoreMutationPolicy {
  constructor(
    private readonly workbook: Workbook,
    private readonly pivotOutputs: PivotOutputProvider = () => [],
    /** Formula results and list sources for rules that need them, built on first use. */
    private readonly reads?: () => ValidationReads,
  ) {}

  /**
   * The transaction's operations that may apply, and the issues they raise.
   * Its validation is one check of {@link ValidationReads}: each list source
   * is read once, and when the check runs out of its budget the whole
   * transaction is refused with a `resource-limit` issue.
   */
  evaluate(
    patches: readonly DocumentOp[],
    commitReason: CommitReason,
    resolver: ProtectionResolver | undefined,
    mode: MutationPolicyMode,
  ): MutationPolicyResult {
    const reads = this.reads?.();
    if (!reads) return this.evaluate_checked(patches, commitReason, resolver, mode);
    try {
      return reads.check(() => this.evaluate_checked(patches, commitReason, resolver, mode));
    } catch (error) {
      if (!(error instanceof ValidationBudgetError)) throw error;
      return {
        patches: [],
        warnings: [],
        rejections: [
          {
            kind: "resource-limit",
            severity: "error",
            resource: "validation-checks",
            actual: error.spent,
            max: error.budget,
            message: "Data validation of this change needs too much work; nothing was changed",
          },
        ],
      };
    }
  }

  private evaluate_checked(
    patches: readonly DocumentOp[],
    commit_reason: CommitReason,
    resolver: ProtectionResolver | undefined,
    mode: MutationPolicyMode,
  ): MutationPolicyResult {
    const allowed: DocumentOp[] = [];
    const warnings: MutationIssue[] = [];
    const rejections: MutationIssue[] = [];
    const rules_by_sheet = new Map<SheetId, DataValidationRule[]>();
    const protections_by_sheet = new Map<SheetId, ProtectedRange[]>();
    let pivots_by_sheet: Map<SheetId, PivotDefinition[]> | undefined;
    const pivots_for = (sheet: SheetId): PivotDefinition[] => {
      pivots_by_sheet ??= new Map();
      let pivots = pivots_by_sheet.get(sheet);
      if (!pivots) {
        pivots = [...(this.sheet(sheet)?.pivots ?? [])];
        pivots_by_sheet.set(sheet, pivots);
      }

      return pivots;
    };

    const rules_for = (sheet: SheetId): DataValidationRule[] => {
      let rules = rules_by_sheet.get(sheet);
      if (!rules) {
        rules = [
          ...(this.workbook.sheets.find((item) => item.id === sheet)?.validationRules ?? []),
        ];
        rules_by_sheet.set(sheet, rules);
      }

      return rules;
    };

    const protections_for = (sheet: SheetId): ProtectedRange[] => {
      let ranges = protections_by_sheet.get(sheet);
      if (!ranges) {
        ranges = [
          ...(this.workbook.sheets.find((item) => item.id === sheet)?.protectedRanges ?? []),
        ];
        protections_by_sheet.set(sheet, ranges);
      }

      return ranges;
    };

    const outputs_by_sheet = new Map<SheetId, ReadonlyArray<{ id: string; range: Range }>>();
    const pivot_outputs_for = (sheet: SheetId): ReadonlyArray<{ id: string; range: Range }> => {
      let outputs = outputs_by_sheet.get(sheet);
      if (!outputs) {
        outputs = this.pivotOutputs(sheet);
        outputs_by_sheet.set(sheet, outputs);
      }

      return outputs;
    };

    for (let operation_index = 0; operation_index < patches.length; operation_index++) {
      const patch = patches[operation_index]!;
      // A fill under many rules can raise millions of issues: they are joined
      // and copied without spreading them into arguments, which overflows the stack.
      let patch_issues: MutationIssue[] = [];
      const sheet_id = patchSheetId(patch);
      if (sheet_id) {
        patch_issues = patch_issues.concat(
          this.protection_issues(
            patch,
            operation_index,
            commit_reason,
            protections_for(sheet_id),
            resolver,
          ),
          // A paste or a fill lands its values as in Excel, whose validation
          // checks typed entries only (`paste.keepValidation` checks in the
          // grid), and undo and redo return to a document that was already allowed.
          commit_reason === "paste" ||
            commit_reason === "fill" ||
            commit_reason === "undo" ||
            commit_reason === "redo"
            ? []
            : this.validation_issues(patch, operation_index, rules_for(sheet_id)),
          this.pivot_output_issues(
            patch,
            operation_index,
            commit_reason,
            sheet_id,
            pivot_outputs_for,
            pivots_for,
          ),
        );
      }

      let rejected = false;
      for (const issue of patch_issues) {
        if (issue.severity === "warning") {
          warnings.push(issue);
        } else {
          rejections.push(issue);
          rejected = true;
        }
      }
      if (rejected) continue;

      allowed.push(patch);

      if (patch.op === "setValidationRule") {
        const rules = rules_for(patch.sheet);
        const index = rules.findIndex((rule) => rule.id === patch.rule.id);
        if (index < 0) rules.push(patch.rule);
        else rules[index] = patch.rule;
      } else if (patch.op === "removeValidationRule") {
        rules_by_sheet.set(
          patch.sheet,
          rules_for(patch.sheet).filter((rule) => rule.id !== patch.id),
        );
      } else if (patch.op === "setProtectedRange") {
        const ranges = protections_for(patch.sheet);
        const index = ranges.findIndex((range) => range.id === patch.protectedRange.id);
        if (index < 0) ranges.push(patch.protectedRange);
        else ranges[index] = patch.protectedRange;
      } else if (patch.op === "removeProtectedRange") {
        protections_by_sheet.set(
          patch.sheet,
          protections_for(patch.sheet).filter((range) => range.id !== patch.id),
        );
      } else if (patch.op === "setPivot") {
        const pivots = pivots_for(patch.sheet);
        const index = pivots.findIndex((pivot) => pivot.id === patch.pivot.id);
        if (index < 0) pivots.push(patch.pivot);
        else pivots[index] = patch.pivot;
      } else if (patch.op === "removePivot") {
        const pivots = pivots_for(patch.sheet);
        const index = pivots.findIndex((pivot) => pivot.id === patch.id);
        if (index >= 0) pivots.splice(index, 1);
      }
    }

    return {
      patches: mode === "atomic" && rejections.length > 0 ? [] : allowed,
      warnings,
      rejections,
    };
  }

  /**
   * Pivot output is derived, so a local value write into it is refused. Undo
   * and redo replay recorded history and stay exempt; the engine then shows
   * the collision as #SPILL!.
   */
  private pivot_output_issues(
    patch: DocumentOp,
    operation_index: number,
    commit_reason: CommitReason,
    sheet_id: SheetId,
    outputs_for: (sheet: SheetId) => ReadonlyArray<{ id: string; range: Range }>,
    pivots_for: (sheet: SheetId) => readonly PivotDefinition[],
  ): MutationIssue[] {
    if (commit_reason === "undo" || commit_reason === "redo") return [];
    if (patch.op !== "setPivot" && !this.sheet(sheet_id)?.pivots?.length) return [];

    const pivots = pivots_for(sheet_id);
    if (patch.op === "setPivot") {
      const pivot = pivots.find(
        (candidate) =>
          candidate.id !== patch.pivot.id &&
          candidate.anchor.row === patch.pivot.anchor.row &&
          candidate.anchor.col === patch.pivot.anchor.col,
      );
      if (!pivot) return [];
      const anchor = cellRange({ sheet: sheet_id, ...pivot.anchor });
      return [pivot_output_issue(pivot.id, anchor, operation_index)];
    }

    const written = pivotWrittenRange(patch);
    if (!written) return [];

    // Outputs were read before the batch; one an earlier patch removed no longer blocks.
    const blocked = outputs_for(sheet_id).find(
      (output) =>
        rangesIntersect(output.range, written) && pivots.some((pivot) => pivot.id === output.id),
    );
    return blocked ? [pivot_output_issue(blocked.id, blocked.range, operation_index)] : [];
  }

  private protection_issues(
    patch: DocumentOp,
    operation_index: number,
    commit_reason: CommitReason,
    protected_ranges: readonly ProtectedRange[],
    resolver: ProtectionResolver | undefined,
  ): MutationIssue[] {
    if (protected_ranges.length === 0) return [];
    const affected = this.affected_ranges(patch);
    if (affected.length === 0) return [];

    const issues: MutationIssue[] = [];
    const seen = new Set<string>();
    for (const protected_range of protected_ranges) {
      if (
        seen.has(protected_range.id) ||
        !affected.some((range) => rangesIntersect(range, protected_range.range))
      ) {
        continue;
      }

      seen.add(protected_range.id);
      let allowed = false;
      try {
        allowed =
          resolver?.({
            protectedRange: protected_range,
            operation: patch,
            commitReason: commit_reason,
          }) === "allow";
      } catch {
        allowed = false;
      }

      if (!allowed) {
        issues.push({
          kind: "protection",
          severity: "error",
          protectedRangeId: protected_range.id,
          range: normalizedRange(protected_range.range),
          operationIndex: operation_index,
          message: protected_range.label
            ? `Protected range "${protected_range.label}" denied this mutation`
            : `Protected range "${protected_range.id}" denied this mutation`,
        });
      }
    }

    return issues;
  }

  private affected_ranges(patch: DocumentOp): Range[] {
    switch (patch.op) {
      case "set":
      case "setNote":
        return [cellRange(patch.addr)];

      case "setRange":
      case "setBlock":
      case "restoreBlock":
      case "setRangeStyle":
      case "clearRange":
      case "permuteRows":
        return [normalizedRange(patch.range)];

      case "moveCells":
        return movedCellBounds(patch);

      case "addMerge":
      case "removeMerge":
        return [
          {
            sheet: patch.sheet,
            start: { row: patch.merge.r0, col: patch.merge.c0 },
            end: { row: patch.merge.r1, col: patch.merge.c1 },
          },
        ];

      case "setHyperlink":
        return [normalizedRange(patch.hyperlink.range)];

      case "removeHyperlink": {
        const hyperlink = this.sheet(patch.sheet)?.hyperlinks?.find(
          (candidate) => candidate.id === patch.id,
        );
        return hyperlink ? [normalizedRange(hyperlink.range)] : [];
      }

      case "setValidationRule":
        return [normalizedRange(patch.rule.range)];

      case "setColumn": {
        const sheet = this.sheet(patch.sheet);
        if (!sheet || sheet.rowCount === 0 || sheet.columns.length === 0) return [];
        return [
          {
            sheet: patch.sheet,
            start: { row: 0, col: patch.col },
            end: { row: sheet.rowCount - 1, col: patch.col },
          },
        ];
      }

      case "setRowMeta": {
        const sheet = this.sheet(patch.sheet);
        if (!sheet || sheet.rowCount === 0 || sheet.columns.length === 0) return [];
        return [
          {
            sheet: patch.sheet,
            start: { row: patch.row, col: 0 },
            end: { row: patch.row, col: sheet.columns.length - 1 },
          },
        ];
      }

      case "addRows":
      case "removeRows":
      case "moveRows":
      case "addColumns":
      case "removeColumns":
      case "moveColumns":
      case "removeSheet":
      case "renameSheet":
      case "moveSheet":
      case "setSheetVisibility": {
        const sheet = this.sheet(patch.sheet);
        if (!sheet || sheet.rowCount === 0 || sheet.columns.length === 0) return [];
        return [fullSheetRange(sheet)];
      }

      case "addSheet":
      case "addTable":
      case "updateTable":
      case "removeTable":
      case "setSheetMeta":
      case "removeValidationRule":
      case "setProtectedRange":
      case "removeProtectedRange":
      case "setNamedRange":
      case "removeNamedRange":
      case "setCalculation":
      case "setExternalLinks":
      case "setRelationship":
      case "removeRelationship":
      case "setMeasure":
      case "removeMeasure":
      case "setQuery":
      case "removeQuery":
      case "setPivot":
      case "removePivot":
      case "setDashboardItem":
      case "removeDashboardItem":
      // A chart only reads its sources, so protection and validation never apply.
      case "setChart":
      case "removeChart":
        return [];

      default: {
        const unclassified: never = patch;
        return unclassified;
      }
    }
  }

  private sheet(id: SheetId): Sheet | undefined {
    return this.workbook.sheets.find((candidate) => candidate.id === id);
  }

  private validation_issues(
    patch: DocumentOp,
    operation_index: number,
    rules: readonly DataValidationRule[],
  ): MutationIssue[] {
    if (rules.length === 0) return [];
    const issues: MutationIssue[] = [];

    if (patch.op === "set" && patch.value.kind === "literal") {
      for (const rule of rules) {
        if (
          rule.policy === "allow" ||
          !rangeContains(rule.range, patch.addr) ||
          validationAccepts(rule, patch.value.value, patch.addr, this.reads?.())
        ) {
          continue;
        }

        issues.push({
          kind: "validation",
          severity: rule.policy === "warn" ? "warning" : "error",
          ruleId: rule.id,
          addr: patch.addr,
          value: patch.value,
          operationIndex: operation_index,
          message: validationIssueMessage(rule),
        });
      }

      return issues;
    }

    if (patch.op === "setRange") {
      const range = normalizedRange(patch.range);
      // Cell offsets are only required to be non-negative, so the furthest
      // offset bounds the written area rather than the declared range end.
      let max_row_offset = 0;
      let max_col_offset = 0;
      for (const cell of patch.cells) {
        if (cell.rowOffset > max_row_offset) max_row_offset = cell.rowOffset;
        if (cell.colOffset > max_col_offset) max_col_offset = cell.colOffset;
      }

      const written: Range = {
        sheet: range.sheet,
        start: range.start,
        end: { row: range.end.row + max_row_offset, col: range.end.col + max_col_offset },
      };

      // A rule can only produce an issue for a cell inside its own range, so
      // rules that miss the written area are dropped before the cell loop.
      const candidates = rules.filter(
        (rule) => rule.policy !== "allow" && rangesIntersect(rule.range, written),
      );
      if (candidates.length === 0) return issues;
      for (const cell of patch.cells) {
        if (cell.value.kind !== "literal") continue;
        const addr = {
          sheet: range.sheet,
          row: range.start.row + cell.rowOffset,
          col: range.start.col + cell.colOffset,
        };

        for (const rule of candidates) {
          if (
            !rangeContains(rule.range, addr) ||
            validationAccepts(rule, cell.value.value, addr, this.reads?.())
          ) {
            continue;
          }

          issues.push({
            kind: "validation",
            severity: rule.policy === "warn" ? "warning" : "error",
            ruleId: rule.id,
            addr,
            value: cell.value,
            operationIndex: operation_index,
            message: validationIssueMessage(rule),
          });
        }
      }

      return issues;
    }

    if (patch.op === "clearRange") {
      const range = normalizedRange(patch.range);
      for (const rule of rules) {
        const rule_range = normalizedRange(rule.range);
        if (
          rule.policy === "allow" ||
          !rangesIntersect(range, rule_range) ||
          validationAccepts(rule, null)
        ) {
          continue;
        }

        const addr = {
          sheet: range.sheet,
          row: Math.max(range.start.row, rule_range.start.row),
          col: Math.max(range.start.col, rule_range.start.col),
        };

        issues.push({
          kind: "validation",
          severity: rule.policy === "warn" ? "warning" : "error",
          ruleId: rule.id,
          addr,
          value: { kind: "literal", value: null },
          operationIndex: operation_index,
          message: validationIssueMessage(rule),
        });
      }

      return issues;
    }

    if (patch.op !== "setBlock" && patch.op !== "restoreBlock") return issues;
    const { block, range: source_range } =
      patch.op === "restoreBlock" ? restoreBlockFacts(patch) : patch;
    const range = patch.op === "restoreBlock" ? source_range : normalizedRange(source_range);
    const formula_offsets = new Set((block.formulas ?? []).map(([offset]) => offset));
    const ref_offsets = new Set((block.refs ?? []).map(([offset]) => offset));
    for (const rule of rules) {
      if (rule.policy === "allow" || rule.range.sheet !== range.sheet) continue;
      const rule_range = normalizedRange(rule.range);
      const row_start = Math.max(range.start.row, rule_range.start.row);
      const row_end = Math.min(range.end.row, rule_range.end.row);
      const col_start = Math.max(range.start.col, rule_range.start.col);
      const col_end = Math.min(range.end.col, rule_range.end.col);
      if (row_start > row_end || col_start > col_end) continue;

      for (let row = row_start; row <= row_end; row++) {
        const row_offset = (row - range.start.row) * block.colCount;
        for (let col = col_start; col <= col_end; col++) {
          const offset = row_offset + col - range.start.col;
          if (formula_offsets.has(offset) || ref_offsets.has(offset)) continue;
          const scalar = block.values[offset] ?? null;
          const addr = { sheet: range.sheet, row, col };
          if (validationAccepts(rule, scalar, addr, this.reads?.())) continue;
          const value: CellValue = { kind: "literal", value: scalar };
          issues.push({
            kind: "validation",
            severity: rule.policy === "warn" ? "warning" : "error",
            ruleId: rule.id,
            addr: { sheet: range.sheet, row, col },
            value,
            operationIndex: operation_index,
            message: validationIssueMessage(rule),
          });
        }
      }
    }

    return issues;
  }
}

function pivot_output_issue(
  pivot_id: string,
  range: Range,
  operation_index: number,
): MutationIssue {
  return {
    kind: "pivot-output",
    severity: "error",
    pivotId: pivot_id,
    range,
    operationIndex: operation_index,
    message: `Pivot table "${pivot_id}" owns these cells`,
  };
}
