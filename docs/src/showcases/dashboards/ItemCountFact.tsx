import { itemCount } from "./item-count.js";

/** The header fact the stage reads from the live dashboard: its item count. */
export function ItemCountFact() {
  return <>{itemCount().toLocaleString("en")}</>;
}
