/**
 * VMS (Vertical Market Software) scoring engine.
 *
 * Constellation Software's insight: niche software businesses with
 * recurring revenue, near-zero churn, and no natural disruptor are the
 * most amenable to DCF analysis because their cash flows are genuinely
 * predictable. This module scores stocks against those characteristics
 * using only signals available from standard financial APIs.
 *
 * Architecture: purely additive — no existing calculation is changed.
 * Components consume this output to show parallel context, not to
 * override any existing verdict or valuation number.
 */

import { StockData } from './types';

// ─── Output types ───────────────────────────────────────────────────────────

export type VmsTier =
  | 'VMS-Like'
  | 'Software Characteristics'
  | 'Mixed'
  | 'Asset-Heavy';

export interface VmsAssessment {
  /** 0–100 composite score */
  score: number;
  /** Bucketed tier label */
  tier: VmsTier;
  /** Human-readable signals that fired (for the education card) */
  signals: string[];
  /** One-line rationale shown in the Quality Indicators row */
  rationale: string;
}

export interface SectorWarning {
  title: string;
  message: string;
  /** 'green' for positive (VMS-Like), 'amber' for caution */
  variant: 'green' | 'amber';
}

// ─── VMS Scoring ─────────────────────────────────────────────────────────────

/**
 * Compute a VMS score from a StockData payload.
 *
 * Inputs are consumed as fractions (0–1) for margin fields, matching the
 * raw convention used by FMP and yfinance. Null fields are treated as
 * "unknown" — the signal is skipped rather than zeroed so a missing
 * grossMargin doesn't unfairly penalise the score.
 */
export function computeVmsScore(
  data: Pick<
    StockData,
    | 'grossMargin'
    | 'operatingMargin'
    | 'fcfPerShare'
    | 'earningsStability'
    | 'debtToEquity'
    | 'revenueGrowth'
  >,
): VmsAssessment {
  let score = 0;
  const signals: string[] = [];

  // 1. Gross margin > 70% (+30 pts) — software-like unit economics
  const gm = data.grossMargin;
  if (gm != null && Number.isFinite(gm)) {
    if (gm > 0.70) {
      score += 30;
      signals.push(`High gross margin (${(gm * 100).toFixed(0)}%) — software-like unit economics`);
    }
  }

  // 2. Operating margin > 20% (+20 pts) — mature niche profitability
  const om = data.operatingMargin;
  if (om != null && Number.isFinite(om)) {
    if (om > 0.20) {
      score += 20;
      signals.push(`Strong operating margin (${(om * 100).toFixed(0)}%) — mature niche profitability`);
    }
  }

  // 3. Positive FCF AND High earnings stability (+20 pts) — predictable cash
  const fcf = data.fcfPerShare ?? 0;
  if (fcf > 0 && data.earningsStability === 'High') {
    score += 20;
    signals.push('Positive FCF with high earnings stability — predictable, recurring cash generation');
  }

  // 4. Debt/equity < 0.5 (+15 pts) — asset-light balance sheet
  const dte = data.debtToEquity ?? 999;
  if (dte < 0.5) {
    score += 15;
    signals.push(`Low debt/equity (${dte.toFixed(2)}) — asset-light, no leverage risk`);
  }

  // 5. Revenue growth 5–20% (+15 pts) — Constellation's sweet spot:
  //    mature niche growth, not a screamer or a decliner
  const rg = data.revenueGrowth ?? 0;
  if (rg >= 5 && rg <= 20) {
    score += 15;
    signals.push(`Moderate revenue growth (${rg.toFixed(1)}%) — mature niche, not a winner-take-most race`);
  }

  const tier: VmsTier =
    score >= 75 ? 'VMS-Like' :
    score >= 50 ? 'Software Characteristics' :
    score >= 25 ? 'Mixed' :
    'Asset-Heavy';

  const rationale =
    tier === 'VMS-Like'
      ? 'Shows hallmarks of a Vertical Market Software business: high margins, stable FCF, low debt, moderate growth — DCF analysis is more reliable here'
      : tier === 'Software Characteristics'
      ? 'Shows some software-like characteristics but not the full VMS profile'
      : tier === 'Mixed'
      ? 'Mix of asset-light and capital-intensive characteristics'
      : 'Capital-intensive or asset-heavy business model — DCF terminal value assumptions carry higher uncertainty';

  return { score, tier, signals, rationale };
}

// ─── Sector Warning ──────────────────────────────────────────────────────────

/**
 * Detect stocks where the standard DCF/P/E/Graham toolkit has known
 * limitations, and stocks where it is especially reliable (VMS-Like).
 *
 * Returns null for ordinary cases (no banner shown).
 *
 * @param impliedGrowthRate  Optional: reverse-DCF implied growth rate (%).
 *                           Pass null/undefined when not yet computed.
 */
export function computeSectorWarning(
  data: Pick<StockData, 'eps' | 'fcfPerShare' | 'earningsStability' | 'growthRate' | 'grossMargin'>,
  vmsScore?: number,
  impliedGrowthRate?: number | null,
): SectorWarning | null {
  const eps = data.eps ?? 0;
  const fcf = data.fcfPerShare ?? 0;
  const stability = data.earningsStability;
  const growthRate = data.growthRate ?? 0;
  const gm = data.grossMargin;

  // ── Positive variant: VMS-Like ──
  if (vmsScore != null && vmsScore >= 75) {
    return {
      title: 'Reliable DCF Candidate',
      message:
        'This business shows Vertical Market Software (VMS) characteristics: high gross margins, predictable recurring revenue, and low leverage. ' +
        'VMS businesses — like those Constellation Software acquires — are among the most amenable to DCF analysis because their cash flows are genuinely predictable. ' +
        'The standard valuation estimates here carry higher-than-average confidence.',
      variant: 'green',
    };
  }

  // ── Amber: binary-outcome / pre-revenue business ──
  // No EPS, no FCF, unstable earnings → likely pre-revenue biotech, early-stage company.
  if (eps <= 0 && fcf <= 0 && stability === 'Low') {
    return {
      title: 'Valuation Limitations — Binary-Outcome Business',
      message:
        'This stock shows signs of a pre-revenue or early-stage company: no positive EPS, no free cash flow, and low earnings stability. ' +
        'Standard DCF, P/E, and Graham methods require positive, predictable earnings — they produce unreliable results for this type of business. ' +
        'The correct framework is a probability-weighted NPV of specific catalysts (e.g. drug approval, product launch), which is outside this tool\'s scope. ' +
        'Treat these numbers as rough bounds at best, and widen any margin of safety substantially.',
      variant: 'amber',
    };
  }

  // ── Amber: high-growth platform with thin margins ──
  // Either the historical growth rate is very high, or the reverse-DCF
  // implies > 30% perpetual growth, combined with thin gross margins.
  const highImplied = impliedGrowthRate != null && Number.isFinite(impliedGrowthRate) && impliedGrowthRate > 30;
  const highHistorical = growthRate > 30;
  const thinMargins = gm != null && Number.isFinite(gm) && gm < 0.40;
  if ((highImplied || highHistorical) && thinMargins) {
    return {
      title: 'Valuation Limitations — High-Growth Platform',
      message:
        'Rapid revenue growth combined with thin gross margins suggests a winner-take-most platform business. ' +
        'For such companies, 80–90% of the DCF value sits in the terminal value — small changes in the discount rate or perpetual growth assumption produce very different intrinsic values. ' +
        'The Reverse DCF (what growth the market is already pricing in) is often more useful than the headline intrinsic value. ' +
        'Consider widening your margin of safety to account for terminal-value uncertainty.',
      variant: 'amber',
    };
  }

  return null;
}

// ─── VMS Verdict Upgrade ─────────────────────────────────────────────────────

/**
 * Determines whether the VMS chip should upgrade a base Watch → Buy.
 *
 * Conditions (all must be met):
 *  - VMS score ≥ 75
 *  - Base verdict is Watch
 *  - MoS is adequate
 *  - Reverse-DCF is not heroic
 *  - Quality is not Speculative
 *  - No modifier chips are firing
 *  - FCF is non-negative (business generates at least some cash)
 *
 * The VMS upgrade fires when FCF yield is positive but below the 5%
 * multibagger threshold — i.e. when the cashQuality gate alone wouldn't
 * promote, but the VMS profile gives additional confidence in cash-flow
 * reliability.
 */
export function evaluateVmsUpgrade(params: {
  vmsScore: number;
  baseAction: string;
  mosStatus: string;
  realityCheck: string;
  quality: string | undefined;
  modifierChipCount: number;
  fcfPerShare: number;
}): boolean {
  const { vmsScore, baseAction, mosStatus, realityCheck, quality, modifierChipCount, fcfPerShare } = params;
  return (
    vmsScore >= 75 &&
    baseAction === 'WATCH' &&
    mosStatus === 'adequate' &&
    realityCheck !== 'heroic' &&
    quality !== 'Speculative' &&
    modifierChipCount === 0 &&
    fcfPerShare > 0
  );
}
