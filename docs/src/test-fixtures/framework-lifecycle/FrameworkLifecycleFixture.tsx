import { onCleanup, onMount } from "solid-js";

interface FrameworkLifecycleFixtureProps {
  readonly framework: string;
}

type Framework = "react" | "vue" | "svelte";
type MountFixture = (host: HTMLElement) => () => void;

function isFramework(framework: string): framework is Framework {
  return framework === "react" || framework === "vue" || framework === "svelte";
}

async function loadFixture(framework: Framework): Promise<MountFixture> {
  switch (framework) {
    case "react": {
      const [{ default: ReactFixture }, { createElement }, { createRoot }] = await Promise.all([
        import("@docs/test-fixtures/framework-lifecycle/ReactFixture.js"),
        import("react"),
        import("react-dom/client"),
      ]);
      return (host) => {
        const root = createRoot(host);
        root.render(createElement(ReactFixture));
        return () => root.unmount();
      };
    }
    case "vue": {
      const [{ default: VueFixture }, { createApp }] = await Promise.all([
        import("@docs/test-fixtures/framework-lifecycle/VueFixture.js"),
        import("vue"),
      ]);
      return (host) => {
        const app = createApp(VueFixture);
        app.mount(host);
        return () => app.unmount();
      };
    }
    case "svelte": {
      const [{ default: SvelteFixture }, { mount, unmount }] = await Promise.all([
        import("@docs/test-fixtures/framework-lifecycle/SvelteFixture.svelte"),
        import("svelte"),
      ]);
      return (host) => {
        const component = mount(SvelteFixture, { target: host });
        return () => void unmount(component);
      };
    }
  }
}

/** Keeps each framework's own adapter lifecycle intact inside the Solid island. */
export function FrameworkLifecycleFixture(props: FrameworkLifecycleFixtureProps) {
  let host: HTMLDivElement | undefined;
  onMount(() => {
    const framework = props.framework;
    if (!isFramework(framework)) return;
    if (host === undefined) throw new Error("Framework lifecycle fixture did not mount its host");
    const target = host;
    let isDisposed = false;
    let unmountFixture: (() => void) | undefined;
    onCleanup(() => {
      isDisposed = true;
      unmountFixture?.();
    });
    void loadFixture(framework).then((mountFixture) => {
      if (!isDisposed) unmountFixture = mountFixture(target);
    });
  });
  return isFramework(props.framework) ? (
    <div
      ref={(element) => {
        host = element;
      }}
    />
  ) : (
    <main>Unknown framework fixture</main>
  );
}
