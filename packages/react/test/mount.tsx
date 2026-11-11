import type { Grid } from "@sheetwrite/core";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";

import type {
  AdapterConformanceProps,
  MountAdapter,
} from "../../../test/adapter-lifecycle-contract.js";
import { SheetwriteGrid } from "../src/index.js";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

export const mountReact: MountAdapter = async (props) => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const gridRef = createRef<Grid>();
  const publishedAtReady: Array<Grid | null | undefined> = [];
  const render = async ({ fallbackLabel, ...gridProps }: AdapterConformanceProps) => {
    await act(async () => {
      root.render(
        <SheetwriteGrid
          {...gridProps}
          ref={gridRef}
          fallback={<span data-lifecycle-fallback>{fallbackLabel}</span>}
          onReady={(event) => {
            publishedAtReady.push(gridRef.current);
            gridProps.onReady?.(event);
          }}
        />,
      );
    });
  };
  await render(props);
  return {
    host,
    publishedAtReady,
    getPublishedGrid: () => gridRef.current,
    render,
    unmount: () => act(async () => root.unmount()),
  };
};
