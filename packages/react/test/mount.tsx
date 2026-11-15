import type { Grid } from "@sheetwrite/core";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";

import type {
  AdapterConformanceProps,
  MountAdapter,
  RenderSimpleAdapter,
} from "../../../test/adapter-lifecycle-contract.js";
import { Sheetwrite, SheetwriteGrid, type SheetwriteProps } from "../src/index.js";

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

export const renderReactSimple: RenderSimpleAdapter = async (host, props) => {
  const errors: unknown[] = [];
  const root = createRoot(host, { onUncaughtError: (error) => errors.push(error) });
  try {
    await act(async () => {
      root.render(<Sheetwrite {...(props as SheetwriteProps<Record<string, string>>)} />);
    });
  } catch (error) {
    errors.push(error);
  }
  return { error: errors[0], unmount: () => act(async () => root.unmount()) };
};
