---
name: Development S&P refresh lease table
description: A database-schema prerequisite for the daily S&P refresh route during local workflow startup.
---

The development database must contain the S&P refresh lease table for coordinated S&P refreshes; if it is absent, the refresh now returns an actionable setup error without terminating the server.

The development database and Drizzle migration journal can be out of sync: the lease table may already exist in the expected shape even though its migration timestamp is missing. Verify both the live columns and journal before applying new migrations. For this legacy table, idempotent `CREATE TABLE IF NOT EXISTS` lets the normal migrator reconcile that state; do not manually insert migration-history rows.

**Why:** The refresh coordination path touches the lease table on application requests, so a missing table is a runtime setup problem that should be visible to the caller while leaving the preview available.

**Why:** A prior migration run encountered the existing table without a matching journal record, blocking later additive migrations.

**How to apply:** If an S&P refresh reports a missing lease relation, verify the development schema/migration state and run the normal migration flow. Do not bypass the lease or alter schema as part of unrelated UI work.

**How to apply:** When a migration reports an existing lease relation, compare its actual columns with the migration before relying on idempotent DDL, then use the normal migrator to record the migration.