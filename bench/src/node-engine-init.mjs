import { performance } from "node:perf_hooks";
import { initSheetwrite } from "@sheetwrite/core";

const engine = process.argv[2];
if (engine !== "default" && engine !== "full") throw new Error("Expected default or full engine");
const formulas = engine === "full" ? await import("@sheetwrite/formulas") : undefined;
const started = performance.now();
await initSheetwrite(undefined, formulas);
process.stdout.write(`${performance.now() - started}\n`);
