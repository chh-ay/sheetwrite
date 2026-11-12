// The /vue/ workbench: the Vue runtime, @sheetwrite/vue and the workbench
// component, loaded by its island (FrameworkMount.tsx).
import VueWorkbench from "@docs/showcases/VueWorkbench.js";
import { createApp } from "vue";

import type { MountWorkbench } from "../FrameworkMount.js";

export const mountVueWorkbench: MountWorkbench = (host) => {
  const app = createApp(VueWorkbench);
  app.mount(host);
  return () => app.unmount();
};
