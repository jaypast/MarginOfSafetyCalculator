# Investment-Signal Research Evidence Index

Reviewed 2026-10-01. The shared [Drive folder](https://drive.google.com/drive/mobile/folders/1h1sMB-JkF9CjHbyGsoClY2Y1zbp_sZSY?usp=sharing) is a source of research leads; its Markdown notes are not primary evidence. The entries below preserve the relevant notes, link to original or authoritative publication records, and state what the findings do and do not support. Summaries are paraphrased, not copied from papers.

## Curated sources

### 1. Multiple testing and the factor zoo

- **Primary source:** Campbell R. Harvey, Yan Liu, and Heqing Zhu, “… and the Cross-Section of Expected Returns,” *The Review of Financial Studies* 29(1), 5–68 (2016; published online 2015), [publisher record and DOI](https://doi.org/10.1093/rfs/hhv059). [NBER working-paper record](https://www.nber.org/papers/w20592).
- **Drive note:** [Harvey, Liu & Zhu — multiple testing in the factor zoo](https://drive.google.com/file/d/1PDu8Kxv7660r1WTBEALE2N_J2WtjpyHV/view).
- **Finding of interest:** Hundreds of proposed return factors create a multiple-testing and publication-bias problem. A conventional \(t>2\) hurdle is too weak for a newly discovered factor; the paper estimates higher, correlation-aware significance cutoffs and popularizes a cutoff around \(t=3\) as a useful reference point.
- **Limits:** This is guidance for assessing a body of factor discoveries, not a universal pass/fail rule for every product metric. It does not validate or invalidate a particular app signal.
- **Verification status — Verified:** Publication metadata checked against Oxford Academic/Crossref; abstract-level claim checked against the publisher/working-paper records. Full publisher text is access-controlled.

### 2. Total asset growth

- **Primary source:** Michael J. Cooper, Huseyin Gulen, and Michael J. Schill, “Asset Growth and the Cross-Section of Stock Returns,” *The Journal of Finance* 63(4), 1609–1651 (2008), [Wiley record and DOI](https://doi.org/10.1111/j.1540-6261.2008.01370.x).
- **Drive note:** [Cooper, Gulen & Schill — asset growth](https://drive.google.com/file/d/1FwropqJFtRhA-On7eHxYM4h78-LZDYid/view).
- **Finding of interest:** The authors report that firm-level annual asset growth predicts subsequent abnormal returns in their U.S. cross-section, including after comparisons with several previously studied firm characteristics.
- **Limits:** The paper studies total asset growth as a predictor. It does not test the app's rule `asset growth > EBITDA growth`, establish that particular comparison as a threshold, or validate the app's stated return-drag magnitude for that different rule.
- **Verification status — Verified:** Wiley publication record, abstract, DOI, authors, issue, and pages checked.

### 3. Accruals and future earnings

- **Primary source:** Richard G. Sloan, “Do Stock Prices Fully Reflect Information in Accruals and Cash Flows About Future Earnings?,” *The Accounting Review* 71(3), 289–315 (1996), [American Accounting Association record and DOI](https://doi.org/10.2308/TAR-9608042309).
- **Drive note:** [Sloan — accruals](https://drive.google.com/file/d/1tC4QpnxpWmyFf1JQgKTmRFWVArOFVBdC/view).
- **Finding of interest:** The paper tests whether accrual and cash-flow components of current earnings carry different information about future earnings and whether prices reflect it. Its accrual result motivates testing earnings quality rather than treating reported earnings as interchangeable with cash generation.
- **Limits:** An accrual anomaly is not an FCF-yield result. Applying it requires consistently defined accrual data, appropriate point-in-time financial statements, and controls for accounting and industry differences.
- **Verification status — Metadata verified; claim summary limited:** AAA publisher record and DOI metadata checked; publication year, volume, issue, and pages verified. The publisher abstract and Crossref abstract metadata were used for the claim summary.

### 4. Cash-based operating profitability

- **Primary source:** Ray Ball, Joseph Gerakos, Juhani T. Linnainmaa, and Valeri Nikolaev, “Accruals, cash flows, and operating profitability in the cross section of stock returns,” *Journal of Financial Economics* 121(1), 28–45 (2016), [ScienceDirect record and DOI](https://doi.org/10.1016/j.jfineco.2016.03.002).
- **Drive note:** [Ball et al. — cash-based operating profitability](https://drive.google.com/file/d/1CgwUKvWbL9BGWyWmdsh0-T1sirj3Lsec/view).
- **Finding of interest:** The authors report that their cash-based operating-profitability measure, which excludes accruals, outperforms accrual-inclusive profitability measures and subsumes accruals in predicting the cross-section of average returns.
- **Limits:** Cash-based operating profitability is not the same construct as free cash flow divided by market capitalization. It does not establish the app's FCF-yield calculation, its 0%/5% cutoffs, or its verdict behavior.
- **Verification status — Verified:** ScienceDirect publisher abstract, DOI, authors, journal, volume, issue, and pages checked.

### 5. Out-of-sample return prediction

- **Primary source:** John Y. Campbell and Samuel B. Thompson, “Predicting Excess Stock Returns Out of Sample: Can Anything Beat the Historical Average?,” *The Review of Financial Studies* 21(4), 1509–1531 (2008), [Oxford Academic record and DOI](https://doi.org/10.1093/rfs/hhm055).
- **Drive note:** [Campbell & Thompson — out-of-sample return prediction](https://drive.google.com/file/d/1L0DG5i-LdbYmhwSXsrpX5BBDCumwbEuq/view).
- **Finding of interest:** The authors show that predictive regressions can beat the historical-average benchmark out of sample when weak sign restrictions are imposed on coefficient estimates.
- **Limits:** This is evidence about aggregate excess-stock-return prediction under specified restrictions, not a company-level factor or an individual-stock return forecast. It is a methodological reference for baseline choice and out-of-sample evaluation, not support for a new stock signal.
- **Verification status — Verified:** Oxford Academic/Crossref publication metadata and publisher abstract-level description checked. The final journal issue is 2008; the article appeared online earlier.

### 6. A hidden Markov model of momentum

- **Primary source:** Kent Daniel, Ravi Jagannathan, and Soohun Kim, “A Hidden Markov Model of Momentum,” author-hosted [Columbia Business School manuscript](https://business.columbia.edu/sites/default/files-efs/pubfiles/26325/djk_20190217.pdf), dated February 17, 2019 and marked “Comments Welcome.”
- **Drive note:** [Hidden Markov model of momentum — scope and timing limitations](https://drive.google.com/file/d/1CMhbKPwmSyojQBdThqIoZYq8oSyClqaZ/view).
- **Finding of interest:** The manuscript models turbulent and calm states in market returns and studies how those states relate to a **cross-sectional momentum strategy**, including momentum-crash risk and a timing strategy.
- **Limits:** This target is not a broad-market-only regime label and not a 52-week-high position signal. The author-hosted manuscript was verified; a final publication record was not independently established for this index, so it is not presented here as a verified peer-reviewed publication.
- **Verification status — Partial:** Authors, manuscript date, abstract, and draft status checked in the original author-hosted PDF; final publication status was not established.

### 7. Inference for characteristic-sorted portfolios

- **Primary source:** Matias D. Cattaneo, Richard K. Crump, Max H. Farrell, and Ernst Schaumburg, “Characteristic-Sorted Portfolios: Estimation and Inference,” *The Review of Economics and Statistics* 102(3), 531–551 (2020), [MIT Press record and DOI](https://doi.org/10.1162/rest_a_00883).
- **Drive note:** [Characteristic-sorted portfolios — factor-test inference](https://drive.google.com/file/d/16A9vdr1vn1wVvPO1h6vRzvV-0gR-4i-6/view).
- **Finding of interest:** The paper treats characteristic sorting as a nonparametric estimation problem and develops inference methods and an approach to choosing the number of portfolios; it illustrates the framework on size and momentum anomalies.
- **Limits:** It improves estimation and inference for sorted portfolios; it does not assert that any particular characteristic predicts returns or that a result transfers to the app's single-stock verdict.
- **Verification status — Verified:** MIT Press/Crossref title, author list, journal, volume, issue, pages, DOI, and abstract checked. The indexed journal publication is 2020; earlier working-paper dates should not replace the final citation.

## Evidence map to current app behavior

The implementation records its multibagger-signal provenance as Anna Yartseva (2025), separately from these seven Drive leads. The current code and existing research note define the behavior; this index does not independently re-audit that paper.

| Current behavior | What the curated sources contribute | What they do not establish |
|---|---|---|
| The verdict treats FCF yield at or below 0% as a negative cash-quality gate and yield above 5% as a strong threshold. | Ball et al. and Sloan motivate distinguishing cash from accrual-based accounting information. Harvey et al. motivate stricter evidence standards before treating a return predictor as established. | Neither Ball et al. nor Sloan tests market-cap-scaled FCF yield or the app's 0%/5% thresholds. Ball's cash-based operating profitability is not FCF yield. In the FMP adapter, FCF yield can be derived from per-share FCF, and FCF/share can itself use an EPS-based estimate when upstream cash data is missing; source quality therefore matters to interpretation. |
| The investment-affordability modifier fires when annual asset growth exceeds EBITDA growth. | Cooper, Gulen & Schill support studying total asset growth as a cross-sectional return characteristic. | Their finding does not validate the app's relative comparison with EBITDA growth, the `>` decision boundary, or a stated effect size for that distinct comparison. The FMP adapter currently emits `assetGrowth: null` because this fetch path does not retrieve the balance-sheet inputs. |
| The 52-week-range modifier fires above 80% of the range. | The curated momentum paper is useful for understanding one cross-sectional momentum-timing question. | Daniel, Jagannathan & Kim study a cross-sectional momentum strategy conditional on market-return states; that is not a 52-week-range measure. None of these Drive sources validates the app's 80% cut point. |
| Offline HMM research uses broad-market monthly returns and volatility and compares HMMs with simpler baselines. | Campbell & Thompson is a reference for honest out-of-sample benchmarks; Harvey et al. and Cattaneo et al. inform inference discipline. | The momentum HMM manuscript is not the same target or feature set as the app's broad-market regime research. The current market-regime module is explicitly offline; these sources do not justify a production regime feature. |

Relevant implementation references: `client/src/components/ValueInvestorVerdict.tsx:369-461`, `server/services/fmpFinance.ts:117-157,192-229`, `shared/schema.ts:90-110`, `server/services/marketRegime.ts:1-7`, `scripts/backtest-market-regimes.ts`, `.agents/skills/multibagger-empirics/SKILL.md:19-65,121-126`.

## Decision memo

### Useful now: research standards, not new scores

- Use Harvey, Liu & Zhu as a warning against selecting winning factors from a large search without accounting for multiple tests and publication bias.
- Use Cattaneo et al. when interpreting characteristic-sorted portfolio evidence: sorting choices affect estimation and inference.
- Use Campbell & Thompson to require a clear benchmark and leakage-safe out-of-sample comparison. Its result is not a stock-level forecasting endorsement.

### Worth testing later, with a separate scope and data review

- **Asset investment:** Test whether the exact app comparison (`asset growth > EBITDA growth`) adds value beyond asset growth alone. Define the population, accounting period, numerator/denominator, and benchmark before looking at results.
- **Cash/accrual quality:** If point-in-time statements are available, compare well-defined cash-based operating profitability and accrual measures separately from FCF yield. Track restatements, missingness, sector accounting, and any FCF estimates.
- For either hypothesis, require point-in-time data, survivorship/delisting controls, a pre-specified test, multiple-testing correction, expanding or walk-forward out-of-sample evaluation, simple baselines, transaction/liquidity costs where a tradable strategy is claimed, and sector sensitivity.

### Do not infer from this index

- Do not change verdict thresholds, scores, valuation formulas, HMM output, or recommendations based on these notes.
- Do not describe a working-paper result as settled or universal. A source's population, variable construction, horizon, and target must match the proposed app behavior before considering implementation.
- Do not treat a research finding about an average cross-sectional portfolio as a prediction for one stock.

## Source and implementation references

- `shared/schema.ts`
- `server/services/fmpFinance.ts`
- `client/src/components/ValueInvestorVerdict.tsx`
- `server/services/marketRegime.ts`
- `scripts/backtest-market-regimes.ts`
- `docs/research/market-regime/spy-2000-2025-source.md`
- `.agents/skills/multibagger-empirics/SKILL.md`