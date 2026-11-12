// The /react/ workbench: the React runtime, @sheetwrite/react and the
// workbench component, loaded by its island (FrameworkMount.tsx).
import ReactWorkbench from "@docs/showcases/ReactWorkbench.js";
import { createElement } from "react";
import { createRoot } from "react-dom/client";

import type { MountWorkbench } from "../FrameworkMount.js";

export const mountReactWorkbench: MountWorkbench = (host) => {
  const root = createRoot(host);
  root.render(createElement(ReactWorkbench));
  return () => root.unmount();
};
