---
name: Prod-vs-dev bug reports
description: How to triage user bug screenshots taken on the published .replit.app domain
---

# Rule
When a user reports a visual/layout bug with a screenshot whose URL bar shows the published `.replit.app` domain, verify the production build is current *before* chasing the bug in dev.

**Why:** A "mobile header still broken" report turned out to be a stale production deployment — dev was verified clean at 375px/400px viewports (Playwright: scrollWidth < innerWidth, zero overflow offenders) while the prod JS bundle lacked recently merged feature markers. The fix was a republish, not a code change.

**How to apply:**
1. `curl` the prod URL, extract the `assets/index-*.js` bundle name, download it.
2. Grep the bundle for a distinctive string from recently merged work (a new UI label works well). Absence ⇒ stale deployment.
3. On iOS, a page element wider than the viewport makes Safari render the whole page zoomed out — the nav/hero look "narrow" with a gray strip on the right. That symptom means horizontal overflow somewhere on the page, not a nav bug.
4. After republishing, ask the user to hard-refresh / force-quit Safari — iOS caches aggressively.
