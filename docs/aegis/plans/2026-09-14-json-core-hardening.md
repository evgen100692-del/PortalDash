# JSON core hardening implementation plan

## Basis and scope

The user approved recommendations 2-6 from the 2026-09-14 audit: reliable JSON persistence, a single JSON architecture, immutable-ID relationships, aligned dependencies/docs/contracts, and automated tests. Authentication and upload hardening are explicitly outside this slice.

Requirement Ready Check: ready. The audit and user follow-up define the scope; no product decision is needed for the selected retirement path.

Change Necessity: code-change. Documentation alone cannot prevent silent data loss, broken references, or mounted 500 responses.

## Architecture integrity

- Canonical owner: shared `JsonStore` for persistence; domain DB modules own normalization and relationship rules.
- Preserved behavior: object, chemical, FAQ, complaint, and notification CRUD; existing display names in API responses.
- New canonical relationships: object `chemical_ids`; chemical stage `object_id`.
- Retirement: remove internal SQLite-only routes, UI modules, ETL/export remnants, and duplicate entry point. No live data is deleted.
- Migration: dry-run by default; `--apply` performs an atomic, backed-up conversion. Runtime compatibility exists only until the migration is applied and is covered by tests.

## TDD route

- Mode: off
- Decision: skipped
- Strict authority: not applicable
- Test posture: post-change regression
- Reason: the user requested tests, not strict test-first development.
- Verification: Node test runner, syntax checks, migration dry-run, HTTP smoke tests, and dependency audit.

## Complexity budget

- Source complexity: add a focused persistence owner and migration script instead of growing route files.
- Test complexity: split persistence, migration/integrity, and HTTP contract tests.
- Budget result: within-budget.

## Execution readiness

- Intent lock: implement only audit recommendations 2-6.
- Scope fence: do not add authentication or redesign uploads in this slice.
- Baseline lock: current JSON data and working CRUD journeys must remain readable.
- Retirement boundary: internal unimplemented modules have no proven external consumers and use delete-first.
- Evidence required: tests pass, retired routes return 404, runtime data dry-run is clean, audit has no known vulnerabilities.

## Tasks

1. Add atomic fail-closed JSON store with backup and health checks; adopt it in every active DB module.
2. Add immutable-ID relationship normalization, validation, delete restrictions, and API presentation fields.
3. Add a dry-run/apply data migration with ambiguity checks and backup-backed writes.
4. Retire SQLite-only server/client paths and remove their menu placeholders.
5. Align package dependencies, scripts, error handling, and README.
6. Add persistence, migration, relationship, and HTTP contract regression tests.
7. Run complete verification and inspect the final diff for stale references.

## Risks and rollback

- Migration ambiguity stops without writing.
- Atomic stores retain a `.bak` copy of the last canonical file.
- Existing name/address fields remain response-only compatibility data while IDs become canonical.
- Source retirement can be restored from Git; persistent files are not removed by this plan.
