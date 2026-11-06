import type { SnapshotCell, XlsxFormulaEngine } from "@sheetwrite/core";

import { formulaContainsExternalReference } from "./formula.js";
import { emitWarning, type XlsxCodecContext } from "./resources.js";

/** A cell of a shared-formula group, which uses the master's text as if it were copied there. */
export interface SharedFormulaMember {
  readonly cell: SnapshotCell;
  readonly address: string;
  /** Formula text the writer put on this cell too; Excel ignores it unless the master does not lex. */
  readonly ownFormula: string | undefined;
}

/**
 * A shared formula: the text stored once on its master cell, and every cell
 * of the group, including the master.
 */
export interface SharedFormulaGroup {
  readonly sheet: string;
  readonly formula: string;
  readonly row: number;
  readonly col: number;
  readonly members: readonly SharedFormulaMember[];
}

/**
 * Set each member's formula: the master's text moved by the engine's copy
 * rule, which paste and fill use, over the distance from the master.
 *
 * A master that does not lex has no copy rule, since the engine cannot parse
 * it either. Then a member keeps the formula text its writer stored on it, if
 * any, and otherwise the master's text. Either may differ from what Excel
 * shows, so the member gets an `unsupported-feature` warning.
 */
export function expandSharedFormulas(
  engine: XlsxFormulaEngine,
  groups: readonly SharedFormulaGroup[],
  context: XlsxCodecContext,
): void {
  for (const group of groups) {
    const lexes = engine.lexes(group.formula);
    const external = formulaContainsExternalReference(group.formula);

    for (const member of group.members) {
      const formula = lexes
        ? member_formula(engine, group, member)
        : unreadable_member_formula(group, member, context);
      set_member_value(group, member, formula, external, context);
    }
  }
}

function member_formula(
  engine: XlsxFormulaEngine,
  group: SharedFormulaGroup,
  member: SharedFormulaMember,
): string {
  const row_delta = member.cell.rowOffset - group.row;
  const col_delta = member.cell.colOffset - group.col;
  if (row_delta === 0 && col_delta === 0) return group.formula;

  return engine.copy(group.formula, row_delta, col_delta);
}

function unreadable_member_formula(
  group: SharedFormulaGroup,
  member: SharedFormulaMember,
  context: XlsxCodecContext,
): string {
  const is_master = member.cell.rowOffset === group.row && member.cell.colOffset === group.col;
  if (is_master) return group.formula;

  emitWarning(context, {
    code: "unsupported-feature",
    message:
      member.ownFormula === undefined
        ? "Shared formula master does not parse; the cell keeps the master's formula text"
        : "Shared formula master does not parse; the cell keeps its own formula text",
    sheet: group.sheet,
    cell: member.address,
  });
  return member.ownFormula ?? group.formula;
}

function set_member_value(
  group: SharedFormulaGroup,
  member: SharedFormulaMember,
  formula: string,
  external: boolean,
  context: XlsxCodecContext,
): void {
  if (!external) {
    member.cell.value = { kind: "formula", src: `=${formula}` };
    return;
  }

  emitWarning(context, {
    code: "external-formula",
    message: "External shared formula was neutralized as inert text",
    sheet: group.sheet,
    cell: member.address,
  });
  member.cell.value = { kind: "literal", value: `=${formula}` };
}
