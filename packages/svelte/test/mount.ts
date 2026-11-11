import type { Grid } from "@sheetwrite/core";

// Bun resolves the public `svelte` entry to its server runtime outside a browser
// bundle, so this component test intentionally selects Svelte's client entry.
import { flushSync, mount, unmount } from "../../../node_modules/svelte/src/index-client.js";
import type {
  AdapterConformanceProps,
  MountAdapter,
} from "../../../test/adapter-lifecycle-contract.js";
import LifecycleHarness from "./LifecycleHarness.svelte";

interface LifecycleHarnessApi {
  update(props: AdapterConformanceProps): void;
  getGrid(): Grid | undefined;
  getPublishedAtReady(): Array<Grid | null | undefined>;
}

async function settle(): Promise<void> {
  flushSync();
  await Promise.resolve();
  flushSync();
}

export const mountSvelte: MountAdapter = async (props) => {
  const host = document.body.appendChild(document.createElement("div"));
  const component = mount(LifecycleHarness, {
    target: host,
    props: { initialProps: props },
  }) as LifecycleHarnessApi;
  await settle();

  return {
    host,
    publishedAtReady: component.getPublishedAtReady(),
    getPublishedGrid: () => component.getGrid(),
    render: async (nextProps) => {
      component.update(nextProps);
      await settle();
    },
    unmount: async () => {
      await unmount(component);
      flushSync();
    },
  };
};
