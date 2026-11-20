/**
 * Writes excel-checks-0.7.0.xlsx: the open Excel checks in one workbook, one
 * sheet per check (see scripts/excel-checks/workbook.ts). Prints the export's
 * warnings.
 *
 *   bun run build && bun scripts/excel-checks-workbook.ts [output.xlsx]
 *
 * scripts/excel-checks-read.ts reads the copy Excel saved back.
 */
import { writeFileSync } from "node:fs";

import { excelChecksWorkbook, loadSheetwrite, WORKBOOK_NAME } from "./excel-checks/workbook.js";

const SECONDS_PER_MINUTE = 60;

const output = process.argv[2] ?? WORKBOOK_NAME;
const workbook = await excelChecksWorkbook(await loadSheetwrite());
writeFileSync(output, workbook.bytes);
const seconds = workbook.checks.reduce((total, check) => total + check.seconds, 0);
process.stdout.write(
  `Wrote ${output}: ${workbook.checks.length} checks, about ${Math.ceil(seconds / SECONDS_PER_MINUTE)} minutes of steps.\n`,
);
for (const warning of workbook.warnings) process.stdout.write(`Export warning: ${warning}\n`);
