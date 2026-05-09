---
name: multibagger-empirics
description: Reasons about which fundamental, technical and macro factors *empirically* predict 10x+ ("multibagger") forward stock returns, based on Yartseva (2025) panel-data study of 464 U.S. multibaggers 2009–2024. Use whenever the user asks "what makes a multibagger", "what predicts long-run outperformance", "is this a multibagger candidate", "should I screen for high-growth winners", "does earnings growth actually predict returns", or when interpreting this app's `multibaggerSignals` block (FCF yield, asset-vs-EBITDA growth, 52-week range) and Fed-rate environment badge. Sibling to `value-investing-masters` — that skill captures the qualitative Graham/Klarman/Munger framework; this one captures the empirically validated factor signs and contradicts the parts of practitioner folklore that the data does not support.
---

# Multibagger Empirics

Apply this skill whenever the user is reasoning about *expected forward return* (not fair value). The companion `value-investing-masters` skill provides the qualitative gates (margin of safety, moat, inversion, circle of competence). This skill provides the empirical factor signs from the Yartseva (2025) panel-data study of 464 U.S. multibaggers 2009–2024 — the parsimonious set of variables that survived a general-to-specific elimination across static FE and dynamic GMM specifications and remained significant predictors of next-year risk-adjusted return.

The two skills are intentionally complementary, and they sometimes disagree. When they do, this skill spells out which way the empirical evidence points and how the app's verdict logic resolves the tension.

## How to apply this skill

1. Walk the qualitative gates from `value-investing-masters` first (circle of competence → quality & moat → inversion → intrinsic value → MoS → reverse-DCF reality check). Most stocks fail there and the answer is short.
2. *Then* layer the empirical factors below to assess **expected-return asymmetry**, not fair value. A stock can be statistically cheap (Graham passes) and still have poor empirical setup (low FCF yield, asset growth outrunning EBITDA, near a 52-week high in a rising-rate environment).
3. When the empirics contradict practitioner folklore the user is leaning on (e.g. "you need 20% EPS growth"), say so explicitly and cite the Yartseva finding. Do not silently average over the contradiction.
4. Never forecast "this stock will multibag." The model identifies factor *exposures* historically associated with the multibagger cohort — it is a screening lens, not a prediction.

## The parsimonious factor set (Yartseva 2025, §6.3)

Each factor below shows: the empirical sign on next-year risk-adjusted return, the rough magnitude reported in the paper, and the app field that implements it.

### 1. Size — TEV (small > large)
- **Sign:** negative. Bigger total enterprise value → lower next-year return.
- **Magnitude:** strongly significant in every specification; coefficient varies (effect size less certain than the sign).
- **Why:** the standard small-cap premium (Fama-French SMB) survives in the multibagger cohort.
- **App field:** not yet wired into the verdict; `stockData.marketCap` is available in `shared/schema.ts` and could feed a future "size tilt" chip.

### 2. Value — B/M and FCF/P (high > low)
- **Sign:** positive. Higher book-to-market and higher free-cash-flow yield → higher next-year return.
- **Magnitude:** the **largest** absolute coefficients in every specification. A 1% increase in B/M or FCF/P is associated with a 7–52% increase in next-year share-price return.
- **Why:** "high-growth stocks must also be value stocks" — the growth-vs-value debate dissolves when you require both. FCF/P is doing double duty as a profitability proxy.
- **App field:** `stockData.multibaggerSignals.fcfYield` (free cash flow / market cap, percent). Wired as the **primary cash-quality gate** in `client/src/components/ValueInvestorVerdict.tsx::evaluateCashQuality`. `≤ 0` blocks Buy → Watch; `> 5%` can promote a borderline Watch to Buy when MoS, reverse-DCF, quality and modifier chips all align.

### 3. Profitability — ROA / EBITDA margin (positive)
- **Sign:** positive but small. Coefficient on ROA in dynamic GMM models is between 0.4 and 1.9.
- **Note:** EBITDA margin is the preferred proxy in static models; ROA replaces it once dynamic structure is accounted for. ROE, ROC, gross/net/operating margin and cash ROIC are all *insignificant* in the dynamic specifications — once FCF/P and ROA are in the model, they add nothing.
- **App field:** none currently wired into the verdict; surfaced informationally via `stockData.competitivePosition` and `Company Quality`.

### 4. Investment-affordability dummy (asset growth vs. EBITDA growth)
- **Sign:** negative. If year-on-year asset growth exceeds year-on-year EBITDA growth, next-year risk-adjusted return is **4–11pp lower**, controlling for other factors. Strongly significant in both static and dynamic frameworks.
- **Why:** the Fama-French investment factor refined. Aggressive investment is *fine* — but only when earnings keep up. Capital deployed faster than EBITDA can support is empirically destructive.
- **App field:** `stockData.multibaggerSignals.assetGrowth` and `ebitdaGrowth` feed `evaluateInvestmentAffordability` in `ValueInvestorVerdict.tsx` — emits a modifier chip that downgrades a base BUY to WATCH (never PASS, never escalates).

### 5. 12-month price-range effect (52-week high vs. low)
- **Sign:** negative. The closer the current price is to its 12-month high, the lower next-year's return tends to be. Strongly significant.
- **Magnitude:** monotone — the paper does not report a single threshold; the app uses `> 80% of the 12-month range` as the modifier chip trigger.
- **Why:** consistent with the Overreaction Hypothesis (De Bondt & Thaler 1985) — momentum has compressed the asymmetry of the setup.
- **App field:** `stockData.multibaggerSignals.week52High` / `week52Low` feed `evaluate52WeekRange` in `ValueInvestorVerdict.tsx`. Modifier chip only.
- **Practical rule from the paper:** "the stock should be close to its 12-month low at the time of purchase and, ideally, have fallen in price considerably in the preceding six months."

### 6. Short-horizon momentum reversal (3- and 6-month)
- **Sign:** negative on 3- and 6-month momentum (i.e. *reversal*). 1-month momentum is positive but only significant in a single specification; 9-, 12-, 24-, 36-month all dropped out as insignificant.
- **Why:** the conventional Jegadeesh-Titman / Carhart momentum effect *does not survive* in the multibagger cohort. These stocks exhibit a term structure of returns with quick trend reversals.
- **App field:** not yet wired. A future "recent drawdown" signal could feed this — note the buy-at-the-12-month-low rule in factor #5 already captures the directionally compatible idea.

### 7. Rising-Fed-rate macro modifier
- **Sign:** negative. When the Fed is hiking, next-year multibagger returns are depressed by **~10pp** (paper reports 8–12pp; the headline summary cites 10.1%) above and beyond any company-specific factor.
- **Why:** higher discount rates compress the present value of long-duration cash flows — the effect is more pronounced for growth/glamour stocks than for value names.
- **Caveat:** this is a *portfolio-wide* effect, not a stock-selection variable. It cannot pick winners, but it *can* refine forecasts for high-growth names.
- **App field:** `server/services/fedRate.ts` classifies the trailing-12-month change as Rising / Stable / Falling at ±50bp. `client/src/components/FedRateBadge.tsx` shows the chip; `shouldShowFedRateCaution` in `ValueInvestorVerdict.tsx` appends an italic informational caution when `environment === 'rising'` AND the stock is growth-tilted (low FCF yield, high P/E, or near 52-week high). Strictly informational — never gates Buy/Watch/Pass.

### 8. Market beta — current S&P 500 return
- **Sign:** positive. Coefficient 0.54–0.93. Multibaggers move with the broad market (consistent with conventional asset-pricing theory).
- **App field:** not surfaced; the verdict is single-stock, not portfolio-level.

## Where the empirics contradict the masters (and how the app resolves it)

The Yartseva findings reinforce most of the Graham/Klarman/Munger framework — small, value, profitable, cash-generative, with a sober macro lens. But two practitioner axioms do *not* survive empirical testing, and one classical metric is actively misleading. The app handles each tension explicitly:

### "You need strong earnings growth"
- **Folklore (Phelps 1972, Lynch 1988, Mayer 2018):** multibaggers must demonstrate sustained earnings growth.
- **Yartseva finding:** growth of EBITDA, EPS and FCF per share — both year-on-year and 5-year CAGR — was **statistically insignificant** in the dynamic models and was eliminated by the general-to-specific process. Asset growth was significant in 3 of 7 specifications but with a small coefficient.
- **App resolution:** the verdict treats growth as a *survival filter* (Munger's "great business" framing in `value-investing-masters` gate 2) and a DCF *input*, but never as a primary expected-return signal. FCF yield, not growth rate, is the cash-quality gate in `evaluateCashQuality`. When the user asks "does growth matter?", the honest answer is: as a sanity check on the DCF, yes; as a return predictor, no.

### "P/E tells you whether a stock is expensive"
- **Folklore:** the headline valuation ratio every retail screener leads with.
- **Yartseva finding:** P/E was **insignificant and actively skewed other coefficients** — explicitly excluded from the modelling. Two reasons: (1) negative or near-zero earnings make it uninterpretable, and (2) extreme values aren't outliers (they're valid observations) but they break the regression.
- **App resolution:** the calculator still computes a P/E-based intrinsic value (it's a useful sanity check vs. peer history per `value-investing-masters` gate 4 — "demand convergence"), but the empirical *return* signal is FCF/P, not P/E. When the user leans on P/E to predict returns, redirect them to FCF yield. The reverse-DCF implied-growth reality check is the right tool for "is the market pricing this for heroic growth?", not P/E.

### "Watch the debt, the buybacks and the Altman score"
- **Folklore:** capital-structure and capital-allocation signals predict returns.
- **Yartseva finding:** debt-to-capital, debt cover, Altman score, debt increase/reduction, and share buybacks were **all insignificant** for return *prediction*. Dividend yield was significant in static models but not in dynamic ones.
- **App resolution:** these remain perfectly valid Klarman-style **survival filters** (gate 3 inversion: "what kills this thesis?" — leverage and liquidity show up there as risks of permanent capital loss). They just are not *return predictors*. The verdict's inversion-risk panel uses `debtToEquity` and `currentRatio` to detect fragility, never to score upside.

The unifying principle: **filters-against-ruin ≠ signals-of-upside**. Graham's defensive screen (low D/E, high current ratio, earnings stability) is doing a different job than Yartseva's parsimonious factor set. The app uses the masters' framework for "should I avoid a permanent loss?" and the multibagger empirics for "is the asymmetry of expected return favourable?". Both questions matter; conflating them produces fake decisiveness.

## Output format

When the user asks for a multibagger-empirics read on a ticker, structure the answer this way (terse, no filler):

```
## [TICKER] — multibagger factor read
Size: [small/mid/large] (TEV $X)
Value: B/M [if available]; FCF/P [strong > 5% / neutral 0–5% / negative ≤ 0]
Profitability: ROA X%, EBITDA margin X%
Investment affordability: [OK / unaffordable — asset growth X% vs. EBITDA growth X%]
12-month range: X% of 52w range [favourable < 50% / neutral 50–80% / unfavourable > 80%]
Macro: Fed environment [rising/stable/falling]; growth-tilted? [yes/no]

### Factor verdict (return-asymmetry, NOT fair value)
[Favourable / Mixed / Unfavourable] — one-sentence summary of which factors fire and which don't.

### Where this disagrees with the qualitative read
If the value-investing-masters verdict is BUY but factors are unfavourable (e.g. richly valued by FCF/P, near 52w high, rising rates), say so. The reverse also matters: cheap and cash-generative + unaffordable investment = mixed.
```

If the user asks "is this a multibagger", the disciplined answer is: the model identifies factor exposures historically associated with the cohort; it does not predict that any individual stock will multibag. Be explicit about that.

## Anti-patterns to avoid

- **Treating the model as a forecast for one stock.** Yartseva's coefficients are average effects across 464 multibaggers — they describe what the cohort had in common ex-ante, not what any single stock will do.
- **Conflating "fair value" with "expected return."** The masters' framework answers "is the price wrong?". The empirics answer "is the next-year asymmetry favourable?". Both can be true; either alone is half the picture.
- **Reaching for P/E to make a return claim.** The empirics actively reject P/E as a return predictor. Use it as a peer-history sanity check (per `value-investing-masters`), not as a screen.
- **Citing earnings-growth folklore as if it were evidence.** "Growth investors love EPS growth" is true; "EPS growth predicts multibagger returns" is *not*, by Yartseva's own elimination process. Be honest about this when the user invokes Lynch/Mayer/Phelps.
- **Using debt or buyback signals to predict upside.** Use them to predict ruin (inversion). Different question.
- **Forcing a Buy/Watch/Pass override from the empirics.** The verdict in this app uses FCF yield as a gate and the asset-growth and 52w-high signals as *modifiers* (downgrade-only, never escalate). Macro is informational only. The empirics inform the call; they don't override the qualitative gates.
- **Ignoring the rising-rate caution on long-duration names.** ~10pp average drag is large enough to flag verbally even when it cannot gate the verdict.
- **Treating the 52-week-high signal as "the stock is overbought."** It's an empirical asymmetry observation, not a technical signal — the right phrasing is "momentum has compressed the margin of safety," not "RSI is high."

## Cross-references

- `.agents/skills/value-investing-masters/SKILL.md` — qualitative Graham/Klarman/Munger framework and the gate order. Walk those gates **first**; this skill layers on top.
- `client/src/components/ValueInvestorVerdict.tsx` — `evaluateCashQuality`, `evaluateInvestmentAffordability`, `evaluate52WeekRange`, `isGrowthTilted`, `shouldShowFedRateCaution` are the helpers that operationalise the empirical signals.
- `server/services/fedRate.ts` and `server/services/stockData.ts` — where `multibaggerSignals` and the Fed-rate environment are sourced.
- Source paper: "The Alchemy of Multibagger Stocks" by Anna Yartseva (Feb 2025), `attached_assets/The_Alchemy_of_Multibagger_Stocks_-_Anna_Yartseva_-_CAFE_Worki_1778332091534.pdf`. Findings: §6.3; implications: §7.
