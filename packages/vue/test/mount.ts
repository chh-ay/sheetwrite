import type { Grid } from "@sheetwrite/core";
import { createApp, defineComponent, h, nextTick, ref, shallowRef } from "vue";

import type {
  MountAdapter,
  RenderSimpleAdapter,
} from "../../../test/adapter-lifecycle-contract.js";
import {
  Sheetwrite,
  SheetwriteGrid,
  type SheetwriteGridExpose,
  type SheetwriteProps,
} from "../src/index.js";

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

export const mountVue: MountAdapter = async (props) => {
  const host = document.body.appendChild(document.createElement("div"));
  const component = ref<SheetwriteGridExpose | null>(null);
  const currentProps = shallowRef(props);
  const publishedAtReady: Array<Grid | null | undefined> = [];
  const Parent = defineComponent({
    setup() {
      return () => {
        const { fallbackLabel, ...gridProps } = currentProps.value;
        return h(
          SheetwriteGrid,
          {
            ...gridProps,
            ref: component,
            onReady: (event) => {
              publishedAtReady.push(component.value?.grid);
              gridProps.onReady?.(event);
            },
          },
          { fallback: () => h("span", { "data-lifecycle-fallback": "" }, fallbackLabel) },
        );
      };
    },
  });
  const app = createApp(Parent);
  app.mount(host);
  await settle();

  return {
    host,
    publishedAtReady,
    getPublishedGrid: () => component.value?.grid,
    render: async (nextProps) => {
      currentProps.value = nextProps;
      await settle();
    },
    unmount: async () => {
      app.unmount();
      await nextTick();
    },
  };
};

export const renderVueSimple: RenderSimpleAdapter = async (host, props) => {
  const errors: unknown[] = [];
  const app = createApp({ render: () => h(Sheetwrite, props as SheetwriteProps) });
  app.config.errorHandler = (error) => {
    errors.push(error);
  };
  try {
    app.mount(host);
    await settle();
  } catch (error) {
    errors.push(error);
  }
  return {
    error: errors[0],
    unmount: async () => {
      app.unmount();
      await nextTick();
    },
  };
};
