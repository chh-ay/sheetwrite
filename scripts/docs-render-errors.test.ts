import { describe, expect, it } from "bun:test";

import { renderErrors } from "./docs-render-errors.js";

/**
 * The hydration script of the Memory page when its diagram had a box with
 * three lines under the title, as the docs build wrote it: the kit threw, and
 * Solid serialized the error into the page instead of failing the build.
 */
const OVERFULL_BOX_PAGE = String.raw`<main><h2 id="release-retained-engine-memory">Release retained engine memory</h2></main><script>_$HY.r["0000000010000"]=$R[0]=Object.assign(new Error("The box \"Release\" has 3 lines under its title; keep it to 2"),{stack:"Error: The box \"Release\" has 3 lines under its title; keep it to 2\n    at checkText"})</script>`;

describe("render errors in prerendered pages", () => {
  it("finds the error a figure box over the kit's text limit leaves in the page", () => {
    expect(renderErrors(OVERFULL_BOX_PAGE)).toEqual([
      'Error: The box "Release" has 3 lines under its title; keep it to 2',
    ]);
  });

  it("passes a page whose hydration data holds no error, and an error in a code sample", () => {
    const page = String.raw`<main><pre><code>throw new Error("not a render error")</code></pre></main><script>_$HY.r["0000000010000"]=$R[0]={a:1}</script>`;
    expect(renderErrors(page)).toEqual([]);
  });
});
