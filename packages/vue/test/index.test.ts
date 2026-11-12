import {
  runSharedAdapterLifecycleContract,
  runSimpleAdapterSizeContract,
} from "../../../test/adapter-lifecycle-contract.js";
import { mountVue, renderVueSimple } from "./mount.js";

runSharedAdapterLifecycleContract("Vue", mountVue);
runSimpleAdapterSizeContract("Vue", renderVueSimple);
