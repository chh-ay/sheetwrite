import { captureProcess } from "./script-io.js";
import { PUBLISHABLE_PACKAGE_ORDER } from "./workspace-tooling.js";

/** Whether npm has any version of a package. */
export type RegistryPresence = (name: string) => Promise<boolean>;

async function is_on_registry(name: string): Promise<boolean> {
  try {
    await captureProcess(["npm", "view", name, "version"], {
      failure: ({ stdout, stderr, exitCode: exit_code }) =>
        `npm view ${name} version failed (${exit_code}): ${stderr || stdout}`,
    });
    return true;
  } catch (error) {
    if (String(error).includes("E404")) return false;
    throw error;
  }
}

/**
 * Rejects a release that includes a package npm does not have yet. npm
 * trusted publishing cannot publish the first version of a package, so the
 * publish job would stop partway, after the packages before it in dependency
 * order. This check runs before the publish job publishes anything.
 */
export async function assertPackagesOnRegistry(
  names: readonly string[],
  isPresent: RegistryPresence = is_on_registry,
): Promise<void> {
  const presence = await Promise.all(names.map((name) => isPresent(name)));
  const missing = names.filter((_, index) => !presence[index]);
  if (missing.length === 0) return;
  throw new Error(
    `Not on npm yet: ${missing.join(", ")}. This workflow cannot publish the first version ` +
      "of a package, so it published nothing. Publish the first version by hand as " +
      'CONTRIBUTING.md says ("The workflow cannot publish the first version of a new ' +
      'package"), then start this workflow again.',
  );
}

async function main(): Promise<void> {
  await assertPackagesOnRegistry(PUBLISHABLE_PACKAGE_ORDER);
  console.log(`npm has every package to publish: ${PUBLISHABLE_PACKAGE_ORDER.join(", ")}`);
}

if (import.meta.main) await main();
