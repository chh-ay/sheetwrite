import { onCleanup, onMount } from "solid-js";

interface FrameworkLifecycleFixtureProps {
  readonly framework: string;
}

type Framework = "react" | "vue" | "svelte";
type MountFixture = (host: HTMLElement) => () => void;

function is_framework(framework: string): framework is Framework {
  return framework === "react" || framework === "vue" || framework === "svelte";
}

async function load_fixture(framework: Framework): Promise<MountFixture> {
  switch (framework) {
    case "react": {
      const [
        { default: ReactFixture },
        { createElement: create_element },
        { createRoot: create_root },
      ] = await Promise.all([
        import("@docs/test-fixtures/framework-lifecycle/ReactFixture.js"),
        import("react"),
        import("react-dom/client"),
      ]);
      return (host) => {
        const root = create_root(host);
        root.render(create_element(ReactFixture));
        return () => root.unmount();
      };
    }
    case "vue": {
      const [{ default: VueFixture }, { createApp: create_app }] = await Promise.all([
        import("@docs/test-fixtures/framework-lifecycle/VueFixture.js"),
        import("vue"),
      ]);
      return (host) => {
        const app = create_app(VueFixture);
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
    if (!is_framework(framework)) return;
    if (host === undefined) throw new Error("Framework lifecycle fixture did not mount its host");
    const target = host;
    let is_disposed = false;
    let unmount_fixture: (() => void) | undefined;
    onCleanup(() => {
      is_disposed = true;
      unmount_fixture?.();
    });
    void load_fixture(framework).then((mount_fixture) => {
      if (!is_disposed) unmount_fixture = mount_fixture(target);
    });
  });
  return is_framework(props.framework) ? (
    <div
      ref={(element) => {
        host = element;
      }}
    />
  ) : (
    <main>Unknown framework fixture</main>
  );
}
