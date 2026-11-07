import { useEffect } from "react";

/**
 * Marks the docs page ready for interaction. In an article it runs inside the
 * content boundary, so it fires after the lazy MDX controls hydrate.
 */
export function DocumentReady() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
    return () => {
      delete document.documentElement.dataset.hydrated;
    };
  }, []);
  return null;
}
