---
"@sheetwrite/core": patch
---

Row projection keeps a bounded window of recent transaction IDs and local operation fingerprints. Each window defaults to 8,192 entries. Set `maxRecentTransactions` in `createRowBridge` to a positive safe integer to change the limit. Hosts that apply local echoes directly must deliver them before their identities leave this window. The bridge reuses identity entries and removes the oldest entry without a scan.
