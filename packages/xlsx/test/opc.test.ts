import { describe, expect, it } from "bun:test";

import { SheetwriteError } from "@sheetwrite/core";

import { OpcPackage } from "../src/opc.js";
import { createCodecContext, xlsxFailure } from "../src/resources.js";
import { rawZip } from "./raw-opc.js";

describe("OPC package metadata", () => {
  it("resolves exact and default content types", async () => {
    const archive = rawZip({
      "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/custom/data.bin" ContentType="application/custom"/></Types>`,
      "custom/data.bin": "binary",
      "custom/fallback.xml": "<root/>",
      "custom/extensionless": "plain",
    });
    const packageFile = await OpcPackage.open(archive, createCodecContext("import"));
    await packageFile.load(["custom/data.bin"]);

    expect(packageFile.contentType("custom/data.bin")).toBe("application/custom");
    expect(packageFile.contentType("custom/fallback.XML")).toBe("application/xml");
    expect(packageFile.contentType("custom/extensionless")).toBeUndefined();
    expect(new TextDecoder().decode(packageFile.read("custom/data.bin"))).toBe("binary");
  });

  it("rejects unknown limits and preserves structural backend failures", () => {
    expect(() =>
      createCodecContext("import", {
        resourceLimits: { unknownLimit: 1 } as never,
      }),
    ).toThrow(SheetwriteError);

    const source = {
      name: "SheetwriteError",
      code: "xlsx-import-failed",
      operation: "xlsx-import",
      message: "cross-realm failure",
      context: { format: "xlsx" },
      retryable: false,
    };
    const normalized = xlsxFailure(source, "import", "test", undefined);
    expect(normalized).not.toBe(source);
    expect(normalized).toBeInstanceOf(SheetwriteError);
    expect(normalized).toMatchObject({ ...source, cause: source });
  });
});
