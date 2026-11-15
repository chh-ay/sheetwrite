import {
  runSharedAdapterLifecycleContract,
  runSimpleAdapterSizeContract,
} from "../../../test/adapter-lifecycle-contract.js";
import { mountSvelte, renderSvelteSimple } from "./mount.js";

runSharedAdapterLifecycleContract("Svelte", mountSvelte);
runSimpleAdapterSizeContract("Svelte", renderSvelteSimple);
