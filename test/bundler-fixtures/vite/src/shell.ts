import { initSheetwrite } from "@sheetwrite/core";
import { createSpreadsheetShell } from "@sheetwrite/core/shell";

import "@sheetwrite/core/shell.css";
import "@sheetwrite/core/styles.css";

// The composable shell must load its toolbar and ribbon (the command model)
// lazily, like the grid's built-in chrome.
await initSheetwrite();
const host = document.createElement("div");
document.body.append(host);
createSpreadsheetShell(host, { grid: { data: {} as never, workbook: {} as never } });
