# @sheetwrite/bench

## Unreleased

- Pin the comparison grid to Handsontable 18.1.2, including its 18.1 scrolling, index translation, filtering, and cell-metadata performance improvements.
- Record installed engine versions in data, interaction, paged, and XLSX captures, and require semantic versions in their artifact contracts and the render parser. XLSX comparisons identify ExcelJS from the measured baseline checkout alongside its commit.
- Preserve known million-row Handsontable overflow evidence when action or cleanup failures include their step prefix, without relaxing any other capture failure condition.
- Bound XLSX peak RSS by the observed final RSS because Linux updates VmHWM lazily; retain the artifact's peak-versus-final consistency gate.
- Verify fresh interaction smoke evidence in CI instead of validating the historical committed capture, so the gate checks the current artifact contract and measured workspace version.
- Add default and full formula engine measurements. Keep raw time and allocation samples, output checks, and source hashes.
- Add analysis workloads, WASM file sizes, and fresh Node initialization samples.

## 0.0.2

### Patch Changes

- Updated dependencies [8457eca]
- Updated dependencies [dac694a]
- Updated dependencies [0e09ecc]
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
- Updated dependencies [55b1f35]
- Updated dependencies [b225783]
- Updated dependencies [41f6749]
- Updated dependencies [ce1e404]
- Updated dependencies [41f6749]
  - @sheetwrite/core@0.4.0
  - @sheetwrite/wasm@0.4.0

## 0.0.1

### Patch Changes

- Updated dependencies [6ed7572]
- Updated dependencies [87fadb7]
  - @sheetwrite/core@0.2.0
  - @sheetwrite/wasm@0.2.0
