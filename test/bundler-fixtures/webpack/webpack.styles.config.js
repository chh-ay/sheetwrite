import { resolve } from "node:path";

// The stylesheet build is apart from the main build, so the main build's size
// evidence stays a JavaScript and WASM first paint. webpack's own CSS support
// resolves core's `@import`s and the icon sheet's `url()`.
export default {
  mode: "production",
  entry: "./src/styles.js",
  experiments: { css: true },
  output: {
    path: resolve("dist-styles"),
    filename: "styles.js",
    cssFilename: "styles.css",
    assetModuleFilename: "assets/[name]-[contenthash][ext]",
    clean: true,
  },
};
