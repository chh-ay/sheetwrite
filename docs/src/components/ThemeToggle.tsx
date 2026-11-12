import { Icon } from "./Icon.js";

/**
 * Switches between the light and dark theme. The server renders the dark
 * theme's button; lib/shell.ts relabels it for the theme the head script
 * chose and switches the theme on click.
 */
export function ThemeToggle() {
  return (
    <button
      aria-label="Use light theme"
      class="sw-icon-button"
      data-theme-toggle=""
      title="Use light theme"
      type="button"
    >
      <Icon name="sun" size="md" />
    </button>
  );
}
