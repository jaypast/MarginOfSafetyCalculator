---
name: Development S&P refresh lease table
description: A database-schema prerequisite for the daily S&P refresh route during local workflow startup.
---

The development database must contain the S&P refresh lease table before the root route can complete its daily refresh check; otherwise the server can start and then crash when that route runs.

**Why:** The refresh coordination path touches the lease table on application requests, so a missing table appears as a runtime startup/preview failure rather than a frontend error.

**How to apply:** If the app serves briefly and then exits with a missing S&P lease relation, verify the development schema/migration state before debugging UI changes. Do not alter schema as part of unrelated UI work.