import { describe, expect, it } from "bun:test";

import { ExpressiveCode } from "expressive-code";

import { scopeCopyButtonStates } from "../src/lib/expressive-code-styles";

async function copyButtonStyles(): Promise<string> {
  return new ExpressiveCode().getBaseStyles();
}

describe("copy button styles", () => {
  it("leaves no rule that restyles every div from a hover or active state", async () => {
    const css = scopeCopyButtonStates(await copyButtonStyles());

    expect(css).not.toMatch(/:(hover|active|focus-visible)[^{},]*\sdiv\s*[,{]/);
    expect(css).toMatch(/\.copy button:hover[^{]*\{[^}]*--sw-copy-fill-opacity:/);
    expect(css).toMatch(
      /\.copy button div\{opacity:var\(--sw-copy-fill-opacity,var\(--ec-[\w-]+\)\)\}$/,
    );
  });

  it("fails loudly when the copy button rules change", () => {
    expect(() => scopeCopyButtonStates(".expressive-code pre{color:red}")).toThrow(
      "no copy button fill rule",
    );
  });
});
