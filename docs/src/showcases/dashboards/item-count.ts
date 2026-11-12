import { createSignal } from "solid-js";

/** How many items the dashboard holds, shared by the stage and the header fact. */
export const [itemCount, setItemCount] = createSignal(0);
