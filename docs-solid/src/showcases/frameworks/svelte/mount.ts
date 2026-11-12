// The /svelte/ workbench: the Svelte runtime, @sheetwrite/svelte and the
// workbench component, loaded by its island (FrameworkMount.tsx).
import SvelteShowcase from "@docs/showcases/SvelteShowcase.svelte";
import { mount, unmount } from "svelte";

import type { MountWorkbench } from "../FrameworkMount.js";

export const mountSvelteWorkbench: MountWorkbench = (host) => {
  const component = mount(SvelteShowcase, { target: host });
  return () => void unmount(component);
};
