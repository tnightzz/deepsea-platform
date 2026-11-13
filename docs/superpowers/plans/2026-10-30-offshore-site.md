# Offshore site replacement implementation plan

Goal: replace site_03 with Dachen offshore context and genuine DCN reference observations, preserving cage_02's existing state.
Spec: ../specs/2026-10-30-offshore-site-design.md (user-approved approach).
Architecture: existing local NMDC hourly JSON and monthly waterquality adapters; no new runtime dependency or network requirement.
Execution: current session, narrowly scoped edits on codex/alarm-page-badges-1028; preserve all pre-existing WIP with per-file backups. No automatic commit/push/merge.

- [x] Download 14 DCN files (202407–202508) from authenticated official download endpoint; parse using existing v3 fixed-width parser. Verify 107-character lines, UTC+8, actual code/coordinates, sentinel handling, unique timestamps and measured coverage. Store raw and JSON with source metadata.
- [x] Regenerate only DCN monthly nearby-water-quality JSON from existing official raw files, using existing `dist_km` and aggregation rules; output directory is a temporary staging directory until all stats are inspected. Verify nearest/farthest distances and null fields; preserve original four JSON files.
- [x] Add `scripts/test_offshore_site.py`: assert farm/server/mock site03 name/sea/DCN, unchanged cage inventory/spec/devices, no XMD source in environmental output, complete DCN history and monthly quality metadata. Run before wiring: expected failure on XMD mapping.
- [x] Change only site03 identity in farm/server/mock, nmdis.SITE_TO_STATION, waterquality.SITE_FILE and direct associated comments/metadata; add transparent source note in environmental pages and management location text. Preserve site IDs and all fish/geometry/stock/threshold values.
- [x] Update scripts and tests that assume site03=XMD; keep unrelated synthetic unit fixtures where still meaningful. Update current docs and source manifest; do not rewrite old meeting/PR history or speech files.
- [x] Run source tests, data consistency, relevant existing regressions and acceptance once. Run an isolated backend without background refresh, check both cages across sea/water/management with Playwright, then stop only that service. Inspect screenshots and zero errors. Record failures separately from pre-existing issues.
- [x] Request independent read-only code review, fix confirmed task-related issues, record final validation and usage snapshot.

Execution note: service8134 retained as requested-task preview; existing8080/8081 left intact. Browser sessions closed. Evidence and validation: docs/验收/大陈外海站点替换-20261030.md.
