import { runSharedAdapterLifecycleContract } from "../../../test/adapter-lifecycle-contract.js";
import { mountVue } from "./mount.js";

runSharedAdapterLifecycleContract("Vue", mountVue);
