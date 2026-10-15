declare module "*svelte/src/index-client.js" {
  export { flushSync, mount, unmount } from "svelte";
}

declare module "*LifecycleHarness.svelte" {
  import type { Workbook } from "@sheetwrite/core";
  import type { Component } from "svelte";
  interface BenchmarkProps {
    workbook: Workbook;
    fallbackLabel: string;
  }
  const harness: Component<
    { initialProps: BenchmarkProps },
    { update(props: BenchmarkProps): void }
  >;
  export default harness;
}
