---
name: Filtering stock universes to common shares only
description: Regex pitfalls when excluding notes/preferreds/funds from screener-derived ticker lists
---

# Filtering stock universes to common shares only

Rule: when excluding non-common-stock instruments (notes, bonds, debentures,
preferreds, CEFs, ETNs, warrants, rights, units, depositary shares) from a
screener-derived ticker list, use broad per-word patterns (`/\bnotes?\b/i`,
`/%/`, `/\bdue\b.{0,40}\b(19|20)\d{2}\b/i`, …) and unit-test them against
*real* security names.

**Why:** a first-pass filter used `\b(...% notes|due 20)\b` — `\bdue 20\b`
never matches "due 2066" (word boundary fails between "20" and "66") and
"% notes" missed "% Global Notes". ~85 exchange-listed debt/fund instruments
shipped in the "Russell 3000" universe and a code review rejected the task.

**How to apply:** keep the exclusion patterns in a shared module consumed by
both the generation script and a dataset integrity test (this repo:
`server/data/universeFilters.ts`, `scripts/build-russell3000.ts`,
`tests/russell3000.test.ts`). The test hardcodes known-bad names/symbols so a
broken regeneration fails CI instead of shipping. Any name containing a
coupon `%` is never a common stock. Plain "Trust" must stay allowed (REITs).
