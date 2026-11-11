import type { Grid } from "@sheetwrite/core";
import { createApp, defineComponent, h, nextTick, ref, shallowRef } from "vue";

import type { MountAdapter } from "../../../test/adapter-lifecycle-contract.js";
import { SheetwriteGrid, type SheetwriteGridExpose } from "../src/index.js";

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
