<script lang="ts">
// Typecheck only: the published `Sheetwrite` declaration must keep the row and ID generics.
import { Sheetwrite } from "@sheetwrite/svelte";

const rows = [{ id: 1, name: "Ada" }];
</script>

<Sheetwrite
  columns={[{ key: "name", title: "Name" }]}
  defaultRows={rows}
  getRowId={(row) => row.id}
  height={240}
/>
