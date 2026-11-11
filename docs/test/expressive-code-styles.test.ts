import { expect, it } from "bun:test";

import { ExpressiveCode } from "expressive-code";

import { scopeCopyButtonStates } from "../src/lib/expressive-code-styles";

it("leaves no copy button rule that restyles every div from a hover or active state", async () => {
  const css = scopeCopyButtonStates(await new ExpressiveCode().getBaseStyles());

  expect(css).not.toMatch(/:(hover|active|focus-visible)[^{},]*\sdiv\s*[,{]/);
  expect(css).toMatch(/\.copy button:hover[^{]*\{[^}]*--sw-copy-fill-opacity:/);
  expect(css).toMatch(
    /\.copy button div\{opacity:var\(--sw-copy-fill-opacity,var\(--ec-[\w-]+\)\)\}$/,
  );
});
