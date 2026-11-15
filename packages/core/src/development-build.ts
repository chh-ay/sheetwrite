/** Set by bundlers; the core package does not depend on Node's types. */
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/**
 * True when the bundler built for development. Bundlers replace
 * `process.env.NODE_ENV` with a string; without a bundler `process` does not
 * exist in a browser, and such a page is not a development build.
 */
export function isDevelopmentBuild(): boolean {
  try {
    return process.env.NODE_ENV === "development";
  } catch (error) {
    if (error instanceof ReferenceError) return false;
    throw error;
  }
}
