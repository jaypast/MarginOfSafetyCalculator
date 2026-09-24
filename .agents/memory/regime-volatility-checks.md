---
name: Regime research volatility sanity checks
description: Why market-regime backtests must validate feature variation independently from numerical covariance safeguards.
---

Raw monthly volatility must be computed without the numerical variance floor used to keep Gaussian emissions stable. Sanity-check that volatility varies across real market periods before interpreting HMM performance; a fixed value can make seed agreement look reassuring while the supposed volatility input carries no information.

**Why:** A prior five-year market-regime result used the emission variance floor for raw feature dispersion, causing nearly all reported volatility to be an artificial constant. The report still produced plausible directional scores, so model-level checks alone did not catch it.

**How to apply:** When extending or rerunning the offline regime research, test the scale and variation of the prepared features, then compare the same fixed walk-forward rules and simple baselines on each period. Do not infer a production signal from stable state labels alone.