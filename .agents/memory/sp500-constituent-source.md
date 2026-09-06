---
name: S&P constituent history source
description: Provider constraint and fallback rule for the S&P 500 constituent-change tracker.
---

FMP’s stable historical S&P 500 constituent endpoint can return HTTP 402 on the project’s current plan even though ordinary FMP fundamentals endpoints work.

**Why:** Treating an empty or plan-gated response as a successful daily check suppresses retries and leaves the tracker silently stale.

**How to apply:** Prefer FMP when available, but retain the attributed public mirror built from S&P press releases. Require either source to produce valid normalized events before recording a successful daily check.