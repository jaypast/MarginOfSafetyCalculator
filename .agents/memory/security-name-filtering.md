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

**Name regexes alone are not enough — cross-check the industry field.** A
second review pass still found closed-end fund trusts ("Gabelli Dividend &
Income Trust"), structured products (ZONES, STRATS), royalty trusts, trust
preferreds ("Dillard's Capital Trust"), MLPs ("… Partners L.P."), and
corporate-form CEFs (Tri-Continental, General American Investors) whose
names dodge every fund keyword. Working rules:
- Nasdaq screener industry "Trusts Except Educational Religious and
  Charitable" ⇒ always a CEF, exclude outright.
- A security *named* "…Trust" is only a real operating company when its
  industry is REIT/real-estate/banking. Finance-industry or commodity-industry
  "Trust" names are CEFs or royalty trusts.
- Exclude `\bL\.P\.\b` / case-sensitive `\bLP\b` / "limited partnership"
  (index providers exclude LPs).
- Corporate-form CEFs have completely innocuous names (e.g. "Central
  Securities Corporation") — the only defense is an explicit symbol denylist.
- Case-sensitive tokens matter: ZONES/STRATS/SATURNS/CorTS are uppercase
  structured-product brands; `municipal` needs the plural (`municipals?`) for
  "…Investment Grade New York Municipals".
