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
    const package_file = await OpcPackage.open(archive, createCodecContext("import"));
    await package_file.load(["custom/data.bin"]);

    expect(package_file.contentType("custom/data.bin")).toBe("application/custom");
    expect(package_file.contentType("custom/fallback.XML")).toBe("application/xml");
    expect(package_file.contentType("custom/extensionless")).toBeUndefined();
    expect(new TextDecoder().decode(package_file.read("custom/data.bin"))).toBe("binary");
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
