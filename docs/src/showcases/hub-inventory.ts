import { CAPABILITY_INVENTORY, CAPABILITY_OWNERS } from "./capabilities.js";
import { assertCapabilityInventory } from "./capability-validation.js";

// Fail closed at module scope: a broken capability contract must never
// prerender, so an invalid inventory fails the hub prerender and the docs build.
// Only the hub component imports this module, which keeps the inventory out of
// the bundle every other page loads.
assertCapabilityInventory(CAPABILITY_INVENTORY, CAPABILITY_OWNERS);

export type { CapabilityOwnerId } from "./capabilities.js";
export { CAPABILITY_OWNERS };
