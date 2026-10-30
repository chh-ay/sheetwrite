/**
 * Reader preferences (theme, package manager, framework tab) are optional.
 * A browser can block storage: privacy settings, some embedded frames, and
 * full quotas make `localStorage` throw a `DOMException`. Then the controls
 * keep working for this page view and nothing is saved.
 */
export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (cause) {
    if (cause instanceof DOMException) return null;
    throw cause;
  }
}

/** Saves a reader preference when the browser allows it; see {@link readPreference}. */
export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (cause) {
    if (!(cause instanceof DOMException)) throw cause;
  }
}
