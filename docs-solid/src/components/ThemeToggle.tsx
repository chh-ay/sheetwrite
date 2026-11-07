import { writePreference } from "@docs/lib/preference-storage.js";
import { createSignal, onMount } from "solid-js";

import { Icon } from "./Icon.js";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Switches between the light and dark theme and remembers the choice. */
export function ThemeToggle() {
  // The server render and hydration show "dark"; the page's theme is read after mount.
  const [theme, setTheme] = createSignal<Theme>("dark");

  onMount(() => setTheme(currentTheme()));

  const toggle = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    writePreference("sheetwrite-theme", next);
    setTheme(next);
  };
  const label = () => `Use ${theme() === "dark" ? "light" : "dark"} theme`;

  return (
    <button
      aria-label={label()}
      class="sw-icon-button"
      onClick={toggle}
      title={label()}
      type="button"
    >
      <Icon name={theme() === "dark" ? "sun" : "moon"} size="md" />
    </button>
  );
}
