import { realpathSync } from "node:fs";

import { compile } from "svelte/compiler";

const typescript = new Bun.Transpiler({ loader: "ts", target: "browser" });
// Bun may cache the server entry before this preload's resolver runs. Compiled
// components must explicitly import the client entry so untrack is not a no-op.
const svelteClient = realpathSync(
  new URL("./src/index-client.js", import.meta.resolve("svelte/package.json")).pathname,
);

Bun.plugin({
  name: "svelte-test-compiler",
  setup(build) {
    build.onResolve({ filter: /^svelte$/ }, () => ({ path: svelteClient }));
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      let source = await Bun.file(path).text();
      source = source.replace(
        /<script([^>]*\blang=["']ts["'][^>]*)>([\s\S]*?)<\/script>/g,
        (_match, attributes: string, script: string) =>
          `<script${attributes.replace(/\s*lang=["']ts["']/, "")}>${typescript.transformSync(script)}</script>`,
      );
      const result = compile(source, {
        filename: path,
        generate: "client",
        dev: true,
        accessors: true,
      });
      return {
        contents: result.js.code.replace(
          /from (["'])svelte\1/g,
          `from ${JSON.stringify(svelteClient)}`,
        ),
        loader: "js",
      };
    });
  },
});
