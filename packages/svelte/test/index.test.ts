import { runSharedAdapterLifecycleContract } from "../../../test/adapter-lifecycle-contract.js";
import { mountSvelte } from "./mount.js";

runSharedAdapterLifecycleContract("Svelte", mountSvelte);
