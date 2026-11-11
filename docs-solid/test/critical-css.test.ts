import { expect, test } from "bun:test";

import { criticalCss, parseCss } from "../src/islands/critical-css.ts";

const critical = (css: string, classes: readonly string[]) =>
  criticalCss(parseCss(css), new Set(classes));

test("keeps a rule when one of its selectors needs only classes the page uses", () => {
  const css = ".a{color:red}.b,.a .c{margin:0}.a.d{top:0}.b .a{left:0}";
  expect(critical(css, ["a", "c"])).toBe(".a{color:red}.b,.a .c{margin:0}");
});

test("keeps rules that name no class and every non-group at-rule", () => {
  const css =
    ":root{--x:1}h2{margin:0}[data-theme=light] .a{color:#000}@font-face{font-family:F;src:url(f.woff2)}@keyframes k{0%{opacity:0}to{opacity:1}}@layer base,site;";
  expect(critical(css, [])).toBe(
    ":root{--x:1}h2{margin:0}@font-face{font-family:F;src:url(f.woff2)}@keyframes k{0%{opacity:0}to{opacity:1}}@layer base,site;",
  );
});

test("treats classes in functional pseudo-classes and attribute selectors as conditions", () => {
  const css = ".a:not(.b){color:red}:is(.c,.d) .a{top:0}.a[data-x='.e']{left:0}:where(.f){right:0}";
  expect(critical(css, ["a"])).toBe(css);
});

test("filters inside group rules and drops a group left empty", () => {
  const css =
    "@media (width>=40rem){.a{color:red}.b{color:blue}}@supports (display:grid){.b{display:grid}}";
  expect(critical(css, ["a"])).toBe("@media (width>=40rem){.a{color:red}}");
});

test("reads braces, commas and semicolons inside strings as text", () => {
  const css = '.a::before{content:"}{;,"}.b::after{content:"\\"}"}.c{color:red}';
  expect(critical(css, ["a", "c"])).toBe('.a::before{content:"}{;,"}.c{color:red}');
});

test("ignores comments", () => {
  expect(critical("/* .a{} */.a{color:red}\n/*$vite$:1*/", ["a"])).toBe(".a{color:red}");
});
