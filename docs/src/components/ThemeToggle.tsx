import { useEffect, useState } from "react";

import { writePreference } from "../lib/preference-storage.js";
import { Icon } from "./Icon.js";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Switches between the light and dark theme and remembers the choice. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => setTheme(currentTheme()), []);

  const toggle = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    writePreference("sheetwrite-theme", next);
    setTheme(next);
  };
  const label = `Use ${theme === "dark" ? "light" : "dark"} theme`;

  return (
    <button
      aria-label={label}
      className="sw-icon-button"
      onClick={toggle}
      title={label}
      type="button"
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size="md" />
    </button>
  );
}
