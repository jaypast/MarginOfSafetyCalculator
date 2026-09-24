---
name: Development S&P refresh lease table
description: A database-schema prerequisite for the daily S&P refresh route during local workflow startup.
---

The development database must contain the S&P refresh lease table for coordinated S&P refreshes; if it is absent, the refresh now returns an actionable setup error without terminating the server.

**Why:** The refresh coordination path touches the lease table on application requests, so a missing table is a runtime setup problem that should be visible to the caller while leaving the preview available.

**How to apply:** If an S&P refresh reports a missing lease relation, verify the development schema/migration state and run the normal migration flow. Do not bypass the lease or alter schema as part of unrelated UI work.