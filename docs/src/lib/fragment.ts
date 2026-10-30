/**
 * The element ID that a URL fragment names, or an empty string when there is
 * none. Any visitor can type a fragment, so a malformed escape such as `#%`
 * names nothing instead of throwing `URIError` in navigation code.
 */
export function fragmentId(hash: string): string {
  const encoded = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(encoded);
  } catch (cause) {
    if (cause instanceof URIError) return "";
    throw cause;
  }
}
