<script lang="ts">
// A decorative icon from the Sheetwrite sprite; the text beside it carries
// the meaning.
import { iconHref } from "../icons/icon-href.js";
import type { IconName } from "../icons/icon-names.js";

let { name }: { name: IconName } = $props();
</script>

<svg aria-hidden="true" class="sw-icon" focusable="false"><use href={iconHref(name)} /></svg>
