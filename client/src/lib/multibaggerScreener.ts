// Multibagger screener scoring (Task #33).
//
// Pure, side-effect-free scoring of a single ticker against the parsimonious
// factor set documented in `.agents/skills/multibagger-empirics/SKILL.md`
// (Yartseva 2025 §6.3). The score is *descriptive* of historical multibaggers
// — it measures factor-exposure overlap with the cohort, not forward return.
//
// Five sub-scores, each 0–100, plus a weighted composite. Weights mirror the
// rough magnitude of the paper's coefficients (Value the largest, ROA / size
// smaller, momentum-reversal not implemented yet). Growth-rate is *intentionally
// excluded* — the paper eliminated it from the dynamic specifications.
//
// Each sub-score gracefully returns `null` when its inputs are missing so an
// adapter with partial coverage doesn't trip a NaN. The composite renormalises
// across whichever sub-scores actually computed.

import type { StockData } from './types';

export type SubScoreKey = 'size' | 'value' | 'profitability' | 'investment' | 'range';

export interface SubScore {
  key: SubScoreKey;
  label: string;
  score: number | null;     // 0..100, or null when input missing
  rationale: string;        // one-line explanation for the UI
}

export interface MultibaggerScore {
  composite: number | null; // 0..100, or null when no sub-score computed
  subScores: SubScore[];
  missingFactors: SubScoreKey[];
}

// Paper-magnitude-inspired weights. Value (FCF/P) had the largest coefficient
// in every Yartseva specification, so it carries the most weight. Investment
// affordability and 52-week range were both strongly significant; size was
// significant but with a less certain effect size; ROA had the smallest
// dynamic-GMM coefficient.
export const FACTOR_WEIGHTS: Record<SubScoreKey, number> = {
  value: 0.35,
  investment: 0.20,
  range: 0.20,
  size: 0.15,
  profitability: 0.10,
};

const clamp = (v: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// Per-factor scorers
// ---------------------------------------------------------------------------

// Size — TEV percentile proxy via market cap. Smaller is better (Yartseva sign
// is negative). marketCap isn't currently plumbed through `StockData`, so this
// returns `null` whenever it's missing; the composite renormalises.
function scoreSize(stock: StockData): SubScore {
  const mc = (stock as unknown as { marketCap?: number | null }).marketCap;
  if (mc == null || !Number.isFinite(mc) || mc <= 0) {
    return {
      key: 'size',
      label: 'Size (TEV proxy)',
      score: null,
      rationale: 'Market cap unavailable — size factor omitted from composite.',
    };
  }
  const mcB = mc / 1e9;
  // Piecewise-linear bands, smooth at the boundaries:
  //   ≤ $2B = 100, $10B = 75, $50B = 50, $200B = 25, ≥ $1T = 0
  let score: number;
  if (mcB <= 2) score = 100;
  else if (mcB <= 10) score = 100 - ((mcB - 2) / 8) * 25;        // 100 → 75
  else if (mcB <= 50) score = 75 - ((mcB - 10) / 40) * 25;        // 75 → 50
  else if (mcB <= 200) score = 50 - ((mcB - 50) / 150) * 25;      // 50 → 25
  else if (mcB <= 1000) score = 25 - ((mcB - 200) / 800) * 25;    // 25 → 0
  else score = 0;
  return {
    key: 'size',
    label: 'Size (TEV proxy)',
    score: clamp(score),
    rationale: `Market cap ≈ $${mcB.toFixed(1)}B — ${mcB <= 10 ? 'small/mid-cap, favoured by Yartseva size sign' : mcB <= 50 ? 'mid-cap' : 'large-cap; size sign is a headwind'}.`,
  };
}

// Value — FCF yield (free cash flow / market cap, percent). The largest
// absolute coefficient in every Yartseva specification. Falls back to the
// per-share derivation `fcfPerShare / price` when the upstream-computed yield
// is missing.
function scoreValue(stock: StockData): SubScore {
  const upstream = stock.multibaggerSignals?.fcfYield;
  let yieldPct: number | null = null;
  if (upstream != null && Number.isFinite(upstream)) {
    yieldPct = upstream;
  } else if (
    Number.isFinite(stock.price) &&
    stock.price > 0 &&
    Number.isFinite(stock.fcfPerShare)
  ) {
    yieldPct = (stock.fcfPerShare / stock.price) * 100;
  }
  if (yieldPct === null) {
    return {
      key: 'value',
      label: 'Value (FCF yield)',
      score: null,
      rationale: 'FCF yield could not be computed.',
    };
  }
  if (yieldPct <= 0) {
    return {
      key: 'value',
      label: 'Value (FCF yield)',
      score: 0,
      rationale: `FCF yield ${yieldPct.toFixed(1)}% — business is consuming cash.`,
    };
  }
  // Linear ramp 0..10% → 0..100, capped above 10%. Yartseva's >5% threshold
  // sits in the upper half of the band, consistent with the verdict's gate.
  const score = clamp((yieldPct / 10) * 100);
  return {
    key: 'value',
    label: 'Value (FCF yield)',
    score,
    rationale:
      yieldPct > 5
        ? `FCF yield ${yieldPct.toFixed(1)}% — clears the 5% multibagger threshold.`
        : `FCF yield ${yieldPct.toFixed(1)}% — positive but below the 5% threshold.`,
  };
}

// Profitability — Yartseva uses ROA in the dynamic GMM specs. The app doesn't
// currently surface ROA; ROE is the closest proxy in `StockData`. We document
// the substitution in the rationale so the user can discount it appropriately.
function scoreProfitability(stock: StockData): SubScore {
  if (!Number.isFinite(stock.roe)) {
    return {
      key: 'profitability',
      label: 'Profitability (ROA proxy)',
      score: null,
      rationale: 'ROE unavailable — profitability factor omitted.',
    };
  }
  if (stock.roe <= 0) {
    return {
      key: 'profitability',
      label: 'Profitability (ROA proxy)',
      score: 0,
      rationale: `ROE ${stock.roe.toFixed(1)}% — non-positive returns on equity.`,
    };
  }
  // 0 → 0, 20% → 100, capped. ROE is leverage-amplified vs. ROA so the band is
  // intentionally generous; treat the score as a coarse signal.
  const score = clamp((stock.roe / 20) * 100);
  return {
    key: 'profitability',
    label: 'Profitability (ROA proxy)',
    score,
    rationale: `ROE ${stock.roe.toFixed(1)}% (used as ROA proxy — ROA isn't surfaced in this app).`,
  };
}

// Investment affordability — the asset-growth ≤ EBITDA-growth dummy. Yartseva
// reports a 4–11pp drag on next-year return when assets grow faster than
// EBITDA can support. Scale the gap into a 0..100 score: equal growth = 100,
// each 1pp of asset-over-EBITDA excess = -5 points (so a 20pp gap = 0).
function scoreInvestment(stock: StockData): SubScore {
  const a = stock.multibaggerSignals?.assetGrowth;
  const e = stock.multibaggerSignals?.ebitdaGrowth;
  if (a == null || e == null || !Number.isFinite(a) || !Number.isFinite(e)) {
    return {
      key: 'investment',
      label: 'Investment affordability',
      score: null,
      rationale: 'Asset / EBITDA growth missing — investment factor omitted.',
    };
  }
  const gap = a - e;
  if (gap <= 0) {
    return {
      key: 'investment',
      label: 'Investment affordability',
      score: 100,
      rationale: `Asset growth ${a.toFixed(1)}% ≤ EBITDA growth ${e.toFixed(1)}% — capital is being earned, not just deployed.`,
    };
  }
  const score = clamp(100 - gap * 5);
  return {
    key: 'investment',
    label: 'Investment affordability',
    score,
    rationale: `Asset growth ${a.toFixed(1)}% outpaces EBITDA growth ${e.toFixed(1)}% (gap ${gap.toFixed(1)}pp) — Yartseva 4–11pp drag.`,
  };
}

// 52-week-range entry timing. The closer to the low, the better. rangePct =
// (price - low) / (high - low) × 100; score = 100 - rangePct. Identical to
// the verdict's `evaluate52WeekRange` math but kept self-contained so the
// scorer can be tested without pulling in the verdict component's React deps.
function scoreRange(stock: StockData): SubScore {
  const high = stock.multibaggerSignals?.week52High;
  const low = stock.multibaggerSignals?.week52Low;
  if (
    high == null ||
    low == null ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    high <= low ||
    !Number.isFinite(stock.price)
  ) {
    return {
      key: 'range',
      label: '52-week range entry',
      score: null,
      rationale: '52-week high / low missing — entry-timing factor omitted.',
    };
  }
  const rangePct = ((stock.price - low) / (high - low)) * 100;
  const clamped = clamp(rangePct);
  const score = 100 - clamped;
  return {
    key: 'range',
    label: '52-week range entry',
    score,
    rationale:
      rangePct > 80
        ? `Price at ${rangePct.toFixed(0)}% of 52w range — momentum has compressed the asymmetry.`
        : rangePct < 50
          ? `Price at ${rangePct.toFixed(0)}% of 52w range — favourable entry per Yartseva.`
          : `Price at ${rangePct.toFixed(0)}% of 52w range — neutral entry zone.`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function scoreTicker(stock: StockData): MultibaggerScore {
  const subScores: SubScore[] = [
    scoreSize(stock),
    scoreValue(stock),
    scoreProfitability(stock),
    scoreInvestment(stock),
    scoreRange(stock),
  ];

  const missingFactors = subScores
    .filter((s) => s.score === null)
    .map((s) => s.key);

  // Renormalise the weights across the sub-scores that actually computed.
  // If everything is missing, return a null composite so the UI can render
  // an honest "not enough data" state rather than a fake 0.
  let weightSum = 0;
  let weightedTotal = 0;
  for (const s of subScores) {
    if (s.score === null) continue;
    const w = FACTOR_WEIGHTS[s.key];
    weightSum += w;
    weightedTotal += s.score * w;
  }
  const composite = weightSum > 0
    ? Math.round((weightedTotal / weightSum) * 10) / 10
    : null;

  return { composite, subScores, missingFactors };
}

// Compact band label for the composite — used by the UI badge and the
// watchlist sort indicator.
export function compositeBand(composite: number | null): {
  label: 'Strong' | 'Moderate' | 'Weak' | 'Insufficient data';
  tone: 'positive' | 'neutral' | 'negative' | 'muted';
} {
  if (composite === null) return { label: 'Insufficient data', tone: 'muted' };
  if (composite >= 65) return { label: 'Strong', tone: 'positive' };
  if (composite >= 40) return { label: 'Moderate', tone: 'neutral' };
  return { label: 'Weak', tone: 'negative' };
}
