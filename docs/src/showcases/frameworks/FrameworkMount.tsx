import { onCleanup, onMount } from "solid-js";

import { whenNearViewport } from "../lib/near-viewport.js";

/** Mounts a workbench written in another framework into `host`; returns its unmount. */
export type MountWorkbench = (host: HTMLElement) => () => void;

/** Props of {@link FrameworkMount}. */
export interface FrameworkMountProps {
  /** The framework the workbench is written in. */
  readonly framework: "react" | "vue" | "svelte";
  /** Imports the workbench and its framework runtime; called once the host is near the viewport. */
  readonly load: () => Promise<MountWorkbench>;
}

/**
 * Hosts a workbench written in React, Vue or Svelte inside a Solid island.
 * Those pages demonstrate the framework's own adapter, so the workbench stays
 * in that framework: its runtime loads with it, only on that page and only
 * when the host comes near the viewport.
 */
export function FrameworkMount(props: FrameworkMountProps) {
  let host!: HTMLDivElement;
  onMount(() => {
    let disposed = false;
    let unmount: (() => void) | undefined;
    const stopWaiting = whenNearViewport(host, () => {
      void props.load().then((mount) => {
        if (!disposed) unmount = mount(host);
      });
    });
    onCleanup(() => {
      disposed = true;
      stopWaiting();
      unmount?.();
    });
  });
  return (
    <div
      class="sw-framework-island"
      data-framework={props.framework}
      ref={(element) => {
        host = element;
      }}
    />
  );
}

/** The /vue/ page's island. */
export function VueWorkbenchIsland() {
  return (
    <FrameworkMount
      framework="vue"
      load={() => import("./vue/mount.js").then(({ mountVueWorkbench }) => mountVueWorkbench)}
    />
  );
}

/** The /svelte/ page's island. */
export function SvelteWorkbenchIsland() {
  return (
    <FrameworkMount
      framework="svelte"
      load={() =>
        import("./svelte/mount.js").then(({ mountSvelteWorkbench }) => mountSvelteWorkbench)
      }
    />
  );
}

/** The /react/ page's island. */
export function ReactWorkbenchIsland() {
  return (
    <FrameworkMount
      framework="react"
      load={() => import("./react/mount.js").then(({ mountReactWorkbench }) => mountReactWorkbench)}
    />
  );
}
