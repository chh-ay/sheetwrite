import { createGrid, initSheetwrite } from "../../../checkouts/pd-blitproof/packages/core/src/index.ts";
(window as unknown as Record<string, unknown>).corePr = { createGrid, initSheetwrite };
