import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  AlertTriangle,
  Activity,
  Gauge,
  ListChecks,
  CircleHelp,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
} from 'lucide-react';
import {
  StockData,
  ValuationResult,
  ReverseDCFResult,
  CompanyQualityResult,
  MarginOfSafetyParams,
  FedRateResponse,
} from '@/lib/types';
import { isETF, getRecommendedMarginOfSafety } from '@/lib/utils';
import { computeVmsScore, VmsTier } from '@/lib/vmsScore';
import { type InsiderSignalTier } from '@/lib/insiderSignal';

interface ValueInvestorVerdictProps {
  stockData: StockData;
  valuationResults: ValuationResult[];
  reverseDCFResult: ReverseDCFResult | null;
  companyQuality: CompanyQualityResult | null;
  marginOfSafetyParams: MarginOfSafetyParams;
  // Optional macro-context (Task #31). When env=Rising and the stock is
  // growth-tilted, we surface a single informational caution. Never gates
  // Buy/Watch/Pass — purely a sentence-long heads-up.
  fedRateEnvironment?: FedRateResponse | null;
  // Insider activity signal tier (Task #74). Cluster-buy can promote
  // Watch→Buy under the same conditions as the VMS upgrade.
  insiderTier?: InsiderSignalTier | null;
}

export type VerdictAction = 'BUY' | 'WATCH' | 'PASS' | 'OUTSIDE_CIRCLE';
export type MoSStatus = 'adequate' | 'inadequate' | 'negative';
export type ReverseDcfRealityCheck = 'reasonable' | 'aggressive' | 'heroic' | 'pessimistic' | 'unavailable';

// Yartseva (2025) multibagger empirics — Option A (FCF yield as the
// primary cash-quality gate). 'unknown' means we could not compute
// it (no fcfYield, no fcfPerShare, or zero price), in which case the
// gate stays silent rather than guessing.
export type CashQualityStatus = 'negative' | 'neutral' | 'strong' | 'unknown';

export interface ModifierChip {
  label: string;
  detail: string;
}

interface Risk {
  label: string;
  detail: string;
  severity: number;
}

const QUALITY_DEFAULT_MOS: Record<
  'Exceptional' | 'Good' | 'Average' | 'Speculative',
  number
> = {
  Exceptional: 20,
  Good: 30,
  Average: 38,
  Speculative: 45,
};

const describeMoat = (
  competitivePosition: string,
  quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative' | undefined,
): string => {
  if (quality === 'Exceptional' && competitivePosition === 'Strong') {
    return 'Wide moat: market leader with durable competitive advantages.';
  }
  if (competitivePosition === 'Strong') {
    return 'Strong competitive position — likely a meaningful moat (brand, scale, or switching costs).';
  }
  if (competitivePosition === 'Good') {
    return 'Moderate moat — competitive advantages in key areas but not unassailable.';
  }
  if (competitivePosition === 'Average') {
    return 'Limited moat — operates in a competitive market without obvious structural protection.';
  }
  return 'No clear moat identified — high returns may mean-revert as competitors enter.';
};

export const buildInversionRisks = (
  stockData: StockData,
  averageResult: ValuationResult | undefined,
  reverseDCF: ReverseDCFResult | null,
  quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative' | undefined,
  heavyAdjustments: boolean,
): Risk[] => {
  const risks: Risk[] = [];

  if (stockData.debtToEquity >= 1.5) {
    risks.push({
      label: 'Balance-sheet stress',
      detail: `Debt/Equity of ${stockData.debtToEquity.toFixed(1)} is elevated — leverage amplifies downside in a downturn.`,
      severity: stockData.debtToEquity >= 2.5 ? 9 : 7,
    });
  } else if (stockData.debtToEquity >= 1.0) {
    risks.push({
      label: 'Moderate leverage',
      detail: `Debt/Equity of ${stockData.debtToEquity.toFixed(1)} is above the conservative 1.0 ceiling.`,
      severity: 4,
    });
  }

  if (stockData.currentRatio < 1.0) {
    risks.push({
      label: 'Liquidity risk',
      detail: `Current ratio of ${stockData.currentRatio.toFixed(1)} is below 1.0 — short-term obligations exceed liquid assets.`,
      severity: 8,
    });
  } else if (stockData.currentRatio < 1.5) {
    risks.push({
      label: 'Thin liquidity cushion',
      detail: `Current ratio of ${stockData.currentRatio.toFixed(1)} is below the 1.5 comfort threshold.`,
      severity: 3,
    });
  }

  if (stockData.earningsStability === 'Low') {
    risks.push({
      label: 'Earnings volatility',
      detail: 'Low earnings stability — past earnings power is hard to extrapolate forward.',
      severity: 6,
    });
  }

  if (stockData.competitivePosition === 'Weak' || stockData.competitivePosition === 'Average') {
    risks.push({
      label: 'No durable moat',
      detail: `Competitive position rated "${stockData.competitivePosition}" — high returns are unlikely to compound for decades.`,
      severity: stockData.competitivePosition === 'Weak' ? 7 : 4,
    });
  }

  if (stockData.revenueGrowth < 0) {
    risks.push({
      label: 'Top-line contraction',
      detail: `Revenue growth of ${stockData.revenueGrowth.toFixed(1)}% — the business is shrinking, not compounding.`,
      severity: 8,
    });
  } else if (stockData.revenueGrowth < 3) {
    risks.push({
      label: 'Stagnant growth',
      detail: `Revenue growth of ${stockData.revenueGrowth.toFixed(1)}% leaves little room for compounding.`,
      severity: 3,
    });
  }

  if (stockData.eps <= 0) {
    risks.push({
      label: 'Negative earnings',
      detail: 'EPS is non-positive — Graham/P/E anchors don\'t apply, and the model relies on cash flow alone.',
      severity: 8,
    });
  }

  if (stockData.fcfPerShare <= 0) {
    risks.push({
      label: 'No free cash flow',
      detail: 'FCF/share is non-positive — the business is consuming capital, not generating it.',
      severity: 8,
    });
  }

  if (stockData.crossSourceDivergence && stockData.crossSourceDivergence.fields.length > 0) {
    const fields = stockData.crossSourceDivergence.fields.map(f => f.field).join(', ');
    risks.push({
      label: 'Data quality',
      detail: `Providers disagree on ${fields} — the headline numbers (and therefore intrinsic value) are less trustworthy.`,
      severity: 6,
    });
  }

  if (heavyAdjustments) {
    risks.push({
      label: 'Heavily adjusted valuation',
      detail: 'Multiple caps, fallbacks, or overrides were applied — the model couldn\'t trust the raw inputs.',
      severity: 5,
    });
  }

  if (averageResult && averageResult.intrinsicValue > 0 && averageResult.discountPremium > 0) {
    risks.push({
      label: 'Already above intrinsic value',
      detail: `Current price is ${averageResult.discountPremium.toFixed(1)}% above the average intrinsic value — no margin of safety remains.`,
      severity: 7,
    });
  }

  if (
    reverseDCF &&
    (reverseDCF.status === 'above_max' ||
      (reverseDCF.status === 'solved' &&
        stockData.growthRate > 0 &&
        reverseDCF.impliedGrowthRate - stockData.growthRate >= 7))
  ) {
    risks.push({
      label: 'Heroic market expectations',
      detail:
        reverseDCF.status === 'above_max'
          ? 'Market is pricing in growth above the model\'s ceiling — asymmetric risk/reward looks bad.'
          : `Market-implied growth (${reverseDCF.impliedGrowthRate.toFixed(1)}%) is well above the company's historical ${stockData.growthRate.toFixed(1)}%.`,
      severity: 7,
    });
  }

  // Fallbacks so we always have a meaningful inversion section
  if (risks.length < 3) {
    if (quality === 'Speculative' || quality === 'Average') {
      risks.push({
        label: 'Quality risk',
        detail: `${quality}-tier business — small operational mistakes can permanently impair value.`,
        severity: 5,
      });
    }
    risks.push({
      label: 'Capital-cycle risk',
      detail: 'Today\'s margins or returns may compress if industry conditions normalize.',
      severity: 3,
    });
    risks.push({
      label: 'Estimation error',
      detail: 'Intrinsic value depends on multi-year forecasts — small errors compound into big mispricings.',
      severity: 2,
    });
  }

  return risks
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3);
};

export const evaluateMarginOfSafety = (
  averageResult: ValuationResult | undefined,
  recommendedMos: number,
): {
  status: MoSStatus;
  currentDiscountPct: number;
  shortfallPts: number;
} => {
  if (!averageResult || averageResult.intrinsicValue <= 0) {
    return { status: 'inadequate', currentDiscountPct: 0, shortfallPts: recommendedMos };
  }
  const currentDiscountPct = -averageResult.discountPremium;
  if (currentDiscountPct < 0) {
    return {
      status: 'negative',
      currentDiscountPct,
      shortfallPts: recommendedMos + Math.abs(currentDiscountPct),
    };
  }
  if (currentDiscountPct >= recommendedMos) {
    return { status: 'adequate', currentDiscountPct, shortfallPts: 0 };
  }
  return {
    status: 'inadequate',
    currentDiscountPct,
    shortfallPts: recommendedMos - currentDiscountPct,
  };
};

export const evaluateReverseDcf = (
  stockData: StockData,
  reverseDCF: ReverseDCFResult | null,
): { check: ReverseDcfRealityCheck; rationale: string } => {
  if (!reverseDCF) {
    return { check: 'unavailable', rationale: 'Reverse DCF was not computed for this stock.' };
  }
  if (reverseDCF.status === 'not_applicable') {
    return { check: 'unavailable', rationale: reverseDCF.interpretation };
  }
  if (reverseDCF.status === 'above_max') {
    return {
      check: 'heroic',
      rationale: `Market needs growth above ${reverseDCF.impliedGrowthRate.toFixed(0)}% for the price to make sense — heroic.`,
    };
  }
  if (reverseDCF.status === 'below_min') {
    return {
      check: 'pessimistic',
      rationale: `Market is pricing in extreme contraction (≤ ${reverseDCF.impliedGrowthRate.toFixed(0)}%) — possibly an opportunity, possibly an unmodeled problem.`,
    };
  }

  const implied = reverseDCF.impliedGrowthRate;
  const historical = stockData.growthRate;

  if (implied >= 25) {
    return {
      check: 'heroic',
      rationale: `Implied growth of ${implied.toFixed(1)}% is heroic — very few businesses sustain that for a decade.`,
    };
  }

  if (historical > 0) {
    const gap = implied - historical;
    if (gap >= 7) {
      return {
        check: 'aggressive',
        rationale: `Implied growth (${implied.toFixed(1)}%) is ${gap.toFixed(1)} pts above the company's historical ${historical.toFixed(1)}% — aggressive.`,
      };
    }
    if (gap <= -3) {
      return {
        check: 'reasonable',
        rationale: `Implied growth (${implied.toFixed(1)}%) is below historical ${historical.toFixed(1)}% — the market is more pessimistic than the trailing record.`,
      };
    }
    return {
      check: 'reasonable',
      rationale: `Implied growth (${implied.toFixed(1)}%) is roughly in line with historical ${historical.toFixed(1)}% — reasonable.`,
    };
  }

  if (implied >= 15) {
    return {
      check: 'aggressive',
      rationale: `Implied growth of ${implied.toFixed(1)}% is aggressive without a historical track record to validate it.`,
    };
  }
  return {
    check: 'reasonable',
    rationale: `Implied growth of ${implied.toFixed(1)}% is modest in absolute terms.`,
  };
};

// "Outside circle of competence" is fundamentally a user judgement (gate 1
// in the skill), but the app can detect cases where its standard toolkit
// can't model the business reliably enough to *offer* a verdict — wild
// method disagreement, heavy reliance on caps/fallbacks on a low-quality
// business, or noisy underlying data. In those cases the disciplined
// answer is "outside circle — pass" rather than a fake Buy/Watch/Pass.
export const isOutsideCircleSignal = (
  quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative' | undefined,
  valuationResults: ValuationResult[],
  heavyAdjustments: boolean,
  hasSourceDivergence: boolean,
): boolean => {
  const positive = valuationResults
    .filter(r => r.method !== 'Average' && r.intrinsicValue > 0)
    .map(r => r.intrinsicValue);

  // Method spread: max/min ≥ 4× across DCF / P/E / Graham means the
  // three lenses fundamentally disagree on what the business is worth.
  // Even a wide-MoS buy on this signal would be guessing, not investing.
  let wildSpread = false;
  if (positive.length >= 2) {
    const min = Math.min(...positive);
    const max = Math.max(...positive);
    if (min > 0 && max / min >= 4) {
      wildSpread = true;
    }
  }

  if (wildSpread && (heavyAdjustments || quality === 'Speculative')) {
    return true;
  }

  // Heavily-adjusted speculative business with diverging providers — the
  // raw data isn't trustworthy and the model is patching over it.
  if (heavyAdjustments && quality === 'Speculative' && hasSourceDivergence) {
    return true;
  }

  return false;
};

// Yartseva (2025) cash-quality gate (Option A). Prefers the upstream
// `multibaggerSignals.fcfYield` (computed server-side as freeCashflow
// / marketCap, in percent) and falls back to a per-share derivation
// from `fcfPerShare / price` so adapters that only emit per-share
// figures still feed the gate. Returns 'unknown' when nothing is
// computable so the gate can stay silent rather than guess.
export const evaluateCashQuality = (
  stockData: StockData,
): { status: CashQualityStatus; fcfYieldPct: number | null; rationale: string } => {
  const upstream = stockData.multibaggerSignals?.fcfYield;
  let fcfYieldPct: number | null = null;
  if (upstream != null && Number.isFinite(upstream)) {
    fcfYieldPct = upstream;
  } else if (
    Number.isFinite(stockData.price) &&
    stockData.price > 0 &&
    Number.isFinite(stockData.fcfPerShare)
  ) {
    fcfYieldPct = (stockData.fcfPerShare / stockData.price) * 100;
  }

  if (fcfYieldPct === null) {
    return { status: 'unknown', fcfYieldPct: null, rationale: 'FCF yield could not be computed.' };
  }
  if (fcfYieldPct <= 0) {
    return {
      status: 'negative',
      fcfYieldPct,
      rationale: `FCF yield is ${fcfYieldPct.toFixed(1)}% — the business is consuming cash, not generating it.`,
    };
  }
  if (fcfYieldPct > 5) {
    return {
      status: 'strong',
      fcfYieldPct,
      rationale: `FCF yield of ${fcfYieldPct.toFixed(1)}% clears the 5% multibagger threshold (Yartseva 2025).`,
    };
  }
  return {
    status: 'neutral',
    fcfYieldPct,
    rationale: `FCF yield of ${fcfYieldPct.toFixed(1)}% is positive but below the 5% multibagger threshold.`,
  };
};

// Investment-affordability dummy: when a business' total assets grow
// faster than its EBITDA, capital is being deployed faster than
// earnings can support it — a Yartseva (2025) negative empirical
// signal. Modifier chip only; never forces a Pass.
export const evaluateInvestmentAffordability = (stockData: StockData): ModifierChip | null => {
  const a = stockData.multibaggerSignals?.assetGrowth;
  const e = stockData.multibaggerSignals?.ebitdaGrowth;
  if (a == null || e == null || !Number.isFinite(a) || !Number.isFinite(e)) {
    return null;
  }
  if (a > e) {
    return {
      label: 'Investment unaffordability',
      detail: `Asset growth (${a.toFixed(1)}%) outpaces EBITDA growth (${e.toFixed(1)}%) — capital is being deployed faster than earnings can support (Yartseva 2025: 4–11pp drag on next-year return).`,
    };
  }
  return null;
};

// 52-week-range modifier: when current price sits in the upper 80%+
// of the trailing 52-week range, the multibagger empirics suggest
// momentum has compressed the asymmetry of the setup. Modifier chip
// only; never forces a Pass.
export const evaluate52WeekRange = (
  stockData: StockData,
): { chip: ModifierChip | null; rangePct: number | null } => {
  const high = stockData.multibaggerSignals?.week52High;
  const low = stockData.multibaggerSignals?.week52Low;
  if (
    high == null ||
    low == null ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    high <= low
  ) {
    return { chip: null, rangePct: null };
  }
  const rangePct = ((stockData.price - low) / (high - low)) * 100;
  if (rangePct > 80) {
    return {
      chip: {
        label: 'Near 52-week high',
        detail: `Price sits at ${rangePct.toFixed(0)}% of the 52-week range — momentum has compressed the margin of safety.`,
      },
      rangePct,
    };
  }
  return { chip: null, rangePct };
};

// Fed-rate caution (Task #31). When the rate environment is Rising and
// the stock is growth-tilted (low FCF yield, high P/E, or trading near
// its 52-week high), surface an informational caution sentence. Pure
// helper — exported for tests and never modifies the verdict.
export const isGrowthTilted = (stockData: StockData): boolean => {
  const fcfYield = stockData.multibaggerSignals?.fcfYield;
  const fallbackYield =
    stockData.price > 0 && Number.isFinite(stockData.fcfPerShare)
      ? (stockData.fcfPerShare / stockData.price) * 100
      : null;
  const yieldPct =
    fcfYield != null && Number.isFinite(fcfYield) ? fcfYield : fallbackYield;
  if (yieldPct !== null && yieldPct < 2) return true;

  if (Number.isFinite(stockData.peRatio) && stockData.peRatio >= 30) return true;

  const range = evaluate52WeekRange(stockData);
  if (range.chip !== null) return true;

  return false;
};

export const shouldShowFedRateCaution = (
  stockData: StockData,
  fedRate: FedRateResponse | null | undefined,
): boolean => {
  if (!fedRate || fedRate.environment !== 'rising') return false;
  return isGrowthTilted(stockData);
};

// Aggregates which Yartseva (2025) multibagger signals fired so the
// applied-adjustments panel on the search card can record them
// alongside the server-side derivation notes. One human-readable
// string per fired signal; empty list when nothing fires.
export const getMultibaggerSignalNotes = (stockData: StockData): string[] => {
  const notes: string[] = [];
  const cq = evaluateCashQuality(stockData);
  if (cq.status === 'negative' && cq.fcfYieldPct !== null) {
    notes.push(
      `Cash-quality gate fired: FCF yield ${cq.fcfYieldPct.toFixed(1)}% ≤ 0 — blocks Buy (Yartseva 2025).`,
    );
  } else if (cq.status === 'strong' && cq.fcfYieldPct !== null) {
    notes.push(
      `Cash-quality gate: FCF yield ${cq.fcfYieldPct.toFixed(1)}% > 5% — eligible for Watch→Buy promotion (Yartseva 2025).`,
    );
  }
  const aff = evaluateInvestmentAffordability(stockData);
  if (aff) notes.push(`Modifier chip fired: ${aff.label} — ${aff.detail}`);
  const range = evaluate52WeekRange(stockData);
  if (range.chip) notes.push(`Modifier chip fired: ${range.chip.label} — ${range.chip.detail}`);
  return notes;
};

export const decideVerdict = (
  quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative' | undefined,
  mosStatus: MoSStatus,
  realityCheck: ReverseDcfRealityCheck,
  averageResult: ValuationResult | undefined,
  valuationResults: ValuationResult[],
  heavyAdjustments: boolean,
  hasSourceDivergence: boolean,
  // New trailing optional args (Task #30). Defaults preserve the
  // pre-Yartseva 7-arg call sites and tests untouched.
  cashQuality: CashQualityStatus = 'unknown',
  modifierChipCount: number = 0,
  // VMS model upgrade (Task #70). Promotes Watch→Buy when the business
  // profile gives elevated cash-flow confidence without the FCF-yield
  // being strong enough to fire the Yartseva gate alone.
  vmsScore: number = 0,
  fcfPerShare: number = 0,
  // Insider cluster-buy upgrade (Task #74). Promotes Watch→Buy when
  // ≥2 distinct C-suite insiders made open-market purchases in 90 days,
  // using the same guard conditions as the VMS upgrade.
  clusterBuy: boolean = false,
): { action: VerdictAction; rationale: string } => {
  const base = computeBaseVerdict(
    quality,
    mosStatus,
    realityCheck,
    averageResult,
    valuationResults,
    heavyAdjustments,
    hasSourceDivergence,
  );

  // Yartseva (2025) cash-quality gate (Option A). Negative FCF
  // downgrades a base BUY to WATCH; never escalates a WATCH/PASS to
  // anything worse. Strong FCF (>5% yield) promotes a borderline
  // WATCH to BUY only when MoS is adequate, the market isn't heroic,
  // quality isn't Speculative, and no modifier chips are flagged —
  // the cardinal Graham principle (require an adequate cushion)
  // still wins over the empirical promotion rule.
  if (cashQuality === 'negative' && base.action === 'BUY') {
    return {
      action: 'WATCH',
      rationale: `${base.rationale} However, free cash flow is non-positive — the cash-quality gate downgrades to Watch until the business is generating cash.`,
    };
  }
  if (
    cashQuality === 'strong' &&
    base.action === 'WATCH' &&
    mosStatus === 'adequate' &&
    realityCheck !== 'heroic' &&
    quality !== 'Speculative' &&
    modifierChipCount === 0
  ) {
    return {
      action: 'BUY',
      rationale: `${base.rationale} FCF yield clears the 5% multibagger threshold (Yartseva 2025), no modifier chips flagged — promotion to Buy.`,
    };
  }

  // VMS model upgrade (Task #70). Fires when the business shows
  // Vertical Market Software characteristics (high margins, predictable
  // FCF, low leverage) — giving extra confidence in cash-flow
  // reliability even when FCF yield is positive but below 5%.
  // Requires: VMS score ≥ 75, WATCH base, adequate MoS, non-heroic
  // expectations, non-Speculative quality, no modifier chips, and
  // non-negative FCF (minimum: the business is generating cash).
  if (
    vmsScore >= 75 &&
    base.action === 'WATCH' &&
    mosStatus === 'adequate' &&
    realityCheck !== 'heroic' &&
    quality !== 'Speculative' &&
    modifierChipCount === 0 &&
    cashQuality !== 'negative' &&
    fcfPerShare > 0
  ) {
    return {
      action: 'BUY',
      rationale: `${base.rationale} Business shows VMS-like characteristics (high margins, predictable recurring FCF) — elevated cash-flow confidence supports the buy decision.`,
    };
  }

  // Insider cluster-buy upgrade (Task #74). Multiple C-suite insiders
  // making open-market purchases in 90 days is a well-studied conviction
  // signal (Lakonishok & Lee 2001; Cohen et al. 2012). Same guard
  // conditions as VMS upgrade: never promotes into heroic/Speculative/
  // negative-FCF/negative-cash territory.
  if (
    clusterBuy &&
    base.action === 'WATCH' &&
    mosStatus === 'adequate' &&
    realityCheck !== 'heroic' &&
    quality !== 'Speculative' &&
    modifierChipCount === 0 &&
    cashQuality !== 'negative' &&
    fcfPerShare > 0
  ) {
    return {
      action: 'BUY',
      rationale: `${base.rationale} Multiple C-suite insiders made open-market purchases in the past 90 days — a strong conviction signal (Lakonishok & Lee 2001) that aligns management with shareholders at current prices.`,
    };
  }

  // Modifier chips (asset-growth > EBITDA-growth, near-52w-high)
  // only ever downgrade a base BUY to WATCH. They never force a
  // PASS, and they never override an existing WATCH/PASS upward.
  if (modifierChipCount >= 1 && base.action === 'BUY') {
    return {
      action: 'WATCH',
      rationale: `${base.rationale} Secondary modifier${modifierChipCount > 1 ? 's' : ''} flagged — downgrade to Watch.`,
    };
  }

  return base;
};

const computeBaseVerdict = (
  quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative' | undefined,
  mosStatus: MoSStatus,
  realityCheck: ReverseDcfRealityCheck,
  averageResult: ValuationResult | undefined,
  valuationResults: ValuationResult[],
  heavyAdjustments: boolean,
  hasSourceDivergence: boolean,
): { action: VerdictAction; rationale: string } => {
  // Gate 1 (Munger): Circle of competence. The framework's first gate is
  // "if you can't explain how this business makes money in two sentences,
  // pass." That's a user judgement, but the app can flag cases where its
  // standard valuation toolkit is so unreliable for this business that
  // offering a verdict would be fake decisiveness.
  if (
    averageResult &&
    averageResult.intrinsicValue > 0 &&
    isOutsideCircleSignal(quality, valuationResults, heavyAdjustments, hasSourceDivergence)
  ) {
    return {
      action: 'OUTSIDE_CIRCLE',
      rationale:
        'The valuation methods disagree wildly and the model leaned heavily on caps and fallbacks — this business sits outside what the standard toolkit can value with conviction. Pass, or analyze it qualitatively.',
    };
  }

  // Gate: no usable intrinsic value → can't conclude anything but Pass-with-caveat.
  if (!averageResult || averageResult.intrinsicValue <= 0) {
    return {
      action: 'PASS',
      rationale: 'No reliable intrinsic value could be produced — without a valuation anchor the discipline is to step aside.',
    };
  }

  // Gate: market is already pricing in heroic growth — asymmetric setup is bad.
  if (realityCheck === 'heroic') {
    if (mosStatus === 'adequate' && (quality === 'Exceptional' || quality === 'Good')) {
      return {
        action: 'WATCH',
        rationale: 'Margin of safety is met, but reverse DCF says the market expects heroic growth — wait for either growth to materialize or price to fall further.',
      };
    }
    return {
      action: 'PASS',
      rationale: 'Market is pricing in heroic growth — even small disappointment risks permanent capital loss. Better setups exist.',
    };
  }

  // Gate: no margin of safety at all.
  if (mosStatus === 'negative') {
    return {
      action: 'PASS',
      rationale: 'Trading above intrinsic value — no margin of safety. "Fairly valued" is not a buy signal.',
    };
  }

  // Inadequate margin of safety.
  if (mosStatus === 'inadequate') {
    if (quality === 'Exceptional' && realityCheck === 'reasonable') {
      return {
        action: 'WATCH',
        rationale: 'Exceptional business with reasonable expectations, but the discount is below the recommended margin of safety — watch for a better entry.',
      };
    }
    return {
      action: 'WATCH',
      rationale: 'Some discount to intrinsic value, but not enough cushion for the quality tier — wait for a wider margin of safety.',
    };
  }

  // mosStatus === 'adequate' from here on.
  if (realityCheck === 'aggressive') {
    if (quality === 'Exceptional' || quality === 'Good') {
      return {
        action: 'WATCH',
        rationale: 'Margin of safety is met and quality is solid, but market expectations are already aggressive — verify the thesis before committing capital.',
      };
    }
    return {
      action: 'WATCH',
      rationale: 'Margin of safety is met, but lower-quality business plus aggressive market expectations is a risky combination.',
    };
  }

  if (realityCheck === 'pessimistic') {
    return {
      action: 'WATCH',
      rationale: 'Margin of safety is met and the market is unusually pessimistic — promising, but confirm there is no unmodeled problem first.',
    };
  }

  if (quality === 'Speculative') {
    return {
      action: 'WATCH',
      rationale: 'Margin of safety is met, but a speculative-tier business deserves an even wider cushion — keep watching, don\'t rush.',
    };
  }

  return {
    action: 'BUY',
    rationale: 'Margin of safety is met, quality is at least adequate, and the market isn\'t pricing in heroic growth — a fat pitch worth swinging at.',
  };
};

const verdictStyles: Record<
  VerdictAction,
  { bg: string; border: string; text: string; pillBg: string; icon: React.ReactNode; label: string }
> = {
  BUY: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    pillBg: 'bg-green-600 text-white',
    icon: <CheckCircle2 className="w-5 h-5 mr-2" />,
    label: 'Buy',
  },
  WATCH: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    pillBg: 'bg-amber-500 text-white',
    icon: <Clock className="w-5 h-5 mr-2" />,
    label: 'Watch',
  },
  PASS: {
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-800',
    pillBg: 'bg-rose-600 text-white',
    icon: <XCircle className="w-5 h-5 mr-2" />,
    label: 'Pass',
  },
  OUTSIDE_CIRCLE: {
    bg: 'bg-neutral-50',
    border: 'border-neutral-200',
    text: 'text-neutral-700',
    pillBg: 'bg-neutral-700 text-white',
    icon: <CircleHelp className="w-5 h-5 mr-2" />,
    label: 'Outside Circle of Competence',
  },
};

const qualityBadgeColor = (quality?: string): string => {
  switch (quality) {
    case 'Exceptional':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'Good':
      return 'bg-teal-100 text-teal-800 border-teal-200';
    case 'Average':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'Speculative':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    default:
      return 'bg-neutral-100 text-neutral-800 border-neutral-200';
  }
};

const realityCheckLabel: Record<ReverseDcfRealityCheck, { label: string; color: string }> = {
  reasonable: { label: 'Reasonable', color: 'text-emerald-700' },
  aggressive: { label: 'Aggressive', color: 'text-amber-700' },
  heroic: { label: 'Heroic', color: 'text-rose-700' },
  pessimistic: { label: 'Pessimistic', color: 'text-blue-700' },
  unavailable: { label: 'N/A', color: 'text-neutral-600' },
};

const mosStatusLabel: Record<MoSStatus, { label: string; color: string }> = {
  adequate: { label: 'Adequate', color: 'text-emerald-700' },
  inadequate: { label: 'Inadequate', color: 'text-amber-700' },
  negative: { label: 'No margin (price > value)', color: 'text-rose-700' },
};

const ValueInvestorVerdict: React.FC<ValueInvestorVerdictProps> = ({
  stockData,
  valuationResults,
  reverseDCFResult,
  companyQuality,
  marginOfSafetyParams,
  fedRateEnvironment,
  insiderTier,
}) => {
  // ETFs: don't apply single-business framework.
  if (isETF(stockData)) {
    return null;
  }

  const averageResult = valuationResults.find(r => r.method === 'Average');
  const hasNegativeIntrinsicValue = !averageResult || averageResult.intrinsicValue <= 0;
  const hasExtremeDiscountPremium = averageResult ? Math.abs(averageResult.discountPremium) > 5000 : false;
  const isSpecialCase = hasNegativeIntrinsicValue || hasExtremeDiscountPremium;

  if (valuationResults.length === 0) {
    return null;
  }

  // Special-case message — mirrors how ValuationResults handles unmodelable stocks.
  if (isSpecialCase) {
    return (
      <Card className="bg-white rounded-lg shadow-sm border border-neutral-200">
        <CardContent className="p-4">
          <h2 className="text-lg sm:text-xl font-semibold text-[#1A2942] mb-2">
            Value-Investor Verdict
          </h2>
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-amber-600 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-amber-800 font-medium mb-1">Verdict not applicable</p>
                <p className="text-sm text-amber-800">
                  {hasNegativeIntrinsicValue
                    ? 'Intrinsic value could not be reliably estimated (e.g. negative earnings or non-standard business model).'
                    : 'Discount/premium vs. intrinsic value is so extreme that the model can\'t produce a trustworthy verdict.'}
                  {' '}A disciplined value investor would step aside until either the inputs improve or a different framework applies.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const quality = companyQuality?.quality;
  const recommendedMosLabel = quality
    ? getRecommendedMarginOfSafety(quality)
    : '—';
  const recommendedMosNumeric = quality ? QUALITY_DEFAULT_MOS[quality] : marginOfSafetyParams.marginOfSafety;

  const heavyAdjustments = valuationResults
    .filter(r => r.method !== 'Average')
    .reduce((count, r) => count + (r.appliedAdjustments?.length ?? 0), 0) >= 3;

  const risks = buildInversionRisks(
    stockData,
    averageResult,
    reverseDCFResult,
    quality,
    heavyAdjustments,
  );

  const hasSourceDivergence =
    !!stockData.crossSourceDivergence &&
    stockData.crossSourceDivergence.fields.length > 0;

  const mos = evaluateMarginOfSafety(averageResult, recommendedMosNumeric);
  const reality = evaluateReverseDcf(stockData, reverseDCFResult);

  // Yartseva (2025) multibagger empirics — cash-quality gate + chips.
  const cashQuality = evaluateCashQuality(stockData);
  const affordabilityChip = evaluateInvestmentAffordability(stockData);
  const range52w = evaluate52WeekRange(stockData);
  const modifierChips: ModifierChip[] = [affordabilityChip, range52w.chip].filter(
    (c): c is ModifierChip => c !== null,
  );

  // VMS scoring — computed fresh for this render; drives upgrade + chip.
  const vmsAssessment = computeVmsScore(stockData);
  const vmsTierColors: Record<VmsTier, string> = {
    'VMS-Like': 'border-emerald-200 bg-emerald-50 text-emerald-800',
    'Software Characteristics': 'border-blue-200 bg-blue-50 text-blue-800',
    'Mixed': 'border-neutral-200 bg-neutral-50 text-neutral-700',
    'Asset-Heavy': 'border-neutral-200 bg-neutral-50 text-neutral-600',
  };

  const verdict = decideVerdict(
    quality,
    mos.status,
    reality.check,
    averageResult,
    valuationResults,
    heavyAdjustments,
    hasSourceDivergence,
    cashQuality.status,
    modifierChips.length,
    vmsAssessment.score,
    stockData.fcfPerShare ?? 0,
    insiderTier === 'cluster-buy',
  );
  const style = verdictStyles[verdict.action];

  const moatSummary = describeMoat(stockData.competitivePosition, quality);

  return (
    <Card className="bg-white rounded-lg shadow-sm border border-neutral-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="text-lg sm:text-xl font-semibold text-[#1A2942]">
            Value-Investor Verdict
            {stockData && (
              <span className="text-sm font-normal text-neutral-600 ml-2">
                — Graham · Klarman · Munger
              </span>
            )}
          </h2>
          {quality && (
            <Badge
              variant="outline"
              className={`${qualityBadgeColor(quality)} text-xs font-medium`}
              data-testid="verdict-quality-badge"
            >
              {quality} quality
            </Badge>
          )}
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          A disciplined value-investing scorecard built from the same gates as the in-app analyst.
        </p>

        {/* Final verdict pill — front and center so users see it first. */}
        <div
          className={`${style.bg} ${style.border} border rounded-lg p-4 mb-4 flex flex-col items-center text-center`}
          data-testid="verdict-pill"
        >
          <div
            className={`${style.pillBg} inline-flex items-center px-4 py-1.5 rounded-full text-base font-bold mb-2`}
          >
            {style.icon}
            {style.label.toUpperCase()}
          </div>
          <p className={`text-sm ${style.text} max-w-2xl`}>{verdict.rationale}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Quality & Moat */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3">
            <div className="flex items-center mb-2">
              <Shield className="w-4 h-4 text-neutral-600 mr-2" />
              <h3 className="text-sm font-semibold text-neutral-800">Quality &amp; Moat</h3>
            </div>
            <p className="text-sm text-neutral-700 mb-2">{moatSummary}</p>
            <ul className="text-xs text-neutral-600 space-y-0.5">
              <li>ROE: <span className="font-medium">{stockData.roe.toFixed(1)}%</span></li>
              <li>Debt/Equity: <span className="font-medium">{stockData.debtToEquity.toFixed(2)}</span></li>
              <li>Current ratio: <span className="font-medium">{stockData.currentRatio.toFixed(1)}</span></li>
              <li>Earnings stability: <span className="font-medium">{stockData.earningsStability}</span></li>
            </ul>
          </div>

          {/* Inversion */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3" data-testid="verdict-inversion">
            <div className="flex items-center mb-2">
              <ListChecks className="w-4 h-4 text-neutral-600 mr-2" />
              <h3 className="text-sm font-semibold text-neutral-800">
                Inversion — what kills this thesis
              </h3>
            </div>
            <ol className="text-sm text-neutral-700 space-y-1.5 list-decimal list-inside">
              {risks.map((risk, idx) => (
                <li key={idx}>
                  <span className="font-medium">{risk.label}.</span>{' '}
                  <span className="text-neutral-600">{risk.detail}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Margin of Safety */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3" data-testid="verdict-mos">
            <div className="flex items-center mb-2">
              <Gauge className="w-4 h-4 text-neutral-600 mr-2" />
              <h3 className="text-sm font-semibold text-neutral-800">Margin of Safety</h3>
            </div>
            <div className="text-sm text-neutral-700 space-y-1">
              <p>
                Recommended for {quality ?? 'this quality tier'}:{' '}
                <span className="font-medium">{recommendedMosLabel}</span>
              </p>
              <p>
                Current price vs. average IV:{' '}
                <span
                  className={`font-medium ${
                    mos.currentDiscountPct >= recommendedMosNumeric
                      ? 'text-emerald-700'
                      : mos.currentDiscountPct >= 0
                      ? 'text-amber-700'
                      : 'text-rose-700'
                  }`}
                >
                  {Math.abs(mos.currentDiscountPct).toFixed(1)}%{' '}
                  {mos.currentDiscountPct >= 0 ? 'discount' : 'premium'}
                </span>
              </p>
              <p>
                Verdict on MoS:{' '}
                <span className={`font-semibold ${mosStatusLabel[mos.status].color}`}>
                  {mosStatusLabel[mos.status].label}
                </span>
                {mos.status === 'inadequate' && (
                  <span className="text-neutral-600">
                    {' '}
                    — needs another {mos.shortfallPts.toFixed(1)} pts of discount.
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Cash quality (Yartseva 2025 — primary FCF gate) */}
          {cashQuality.status !== 'unknown' && (
            <div
              className="bg-neutral-50 border border-neutral-200 rounded-md p-3"
              data-testid="verdict-cash-quality"
            >
              <div className="flex items-center mb-2">
                <Activity className="w-4 h-4 text-neutral-600 mr-2" />
                <h3 className="text-sm font-semibold text-neutral-800">
                  Cash quality (FCF gate)
                </h3>
              </div>
              <p className="text-sm text-neutral-700">
                FCF yield:{' '}
                <span
                  className={`font-semibold ${
                    cashQuality.status === 'strong'
                      ? 'text-emerald-700'
                      : cashQuality.status === 'negative'
                      ? 'text-rose-700'
                      : 'text-amber-700'
                  }`}
                  data-testid="verdict-fcf-yield"
                >
                  {cashQuality.fcfYieldPct !== null
                    ? `${cashQuality.fcfYieldPct.toFixed(1)}%`
                    : 'n/a'}
                </span>
              </p>
              <p className="text-xs text-neutral-600 mt-1">{cashQuality.rationale}</p>
            </div>
          )}

          {/* Reverse-DCF reality check */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3" data-testid="verdict-reverse-dcf">
            <div className="flex items-center mb-2">
              <Activity className="w-4 h-4 text-neutral-600 mr-2" />
              <h3 className="text-sm font-semibold text-neutral-800">
                Reverse-DCF Reality Check
              </h3>
            </div>
            <p className="text-sm text-neutral-700">
              Market expectations:{' '}
              <span className={`font-semibold ${realityCheckLabel[reality.check].color}`}>
                {realityCheckLabel[reality.check].label}
              </span>
            </p>
            <p className="text-xs text-neutral-600 mt-1">{reality.rationale}</p>
          </div>
        </div>

        {/* Multibagger modifier chips (Yartseva 2025) — only render when
            at least one is active so the panel doesn't add noise. */}
        {modifierChips.length > 0 && (
          <div
            className="mt-4 flex flex-wrap items-start gap-2"
            data-testid="verdict-modifier-chips"
          >
            {modifierChips.map((chip, idx) => (
              <span
                key={idx}
                className="inline-flex items-start px-2 py-1 rounded border border-amber-200 bg-amber-50 text-amber-800 text-xs"
                title={chip.detail}
              >
                <AlertTriangle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
                <span>
                  <span className="font-semibold">{chip.label}.</span>{' '}
                  <span className="text-amber-700">{chip.detail}</span>
                </span>
              </span>
            ))}
          </div>
        )}

        {/* VMS business-model chip — rendered when VMS score ≥ 50. Purely
            informational; the upgrade logic in decideVerdict handles the
            actual verdict impact when score ≥ 75 and all conditions are met. */}
        {vmsAssessment.score >= 50 && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2.5 ${vmsTierColors[vmsAssessment.tier]}`}
            data-testid="verdict-vms-chip"
          >
            <TrendingUp className="h-4 w-4 shrink-0 mt-0.5 opacity-70" />
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-snug">
                Business Model: {vmsAssessment.tier}
              </p>
              <p className="text-xs mt-0.5 opacity-80">{vmsAssessment.rationale}</p>
              {vmsAssessment.score >= 75 && (
                <p className="text-xs mt-1 opacity-70">
                  VMS score {vmsAssessment.score}/100 — watch for promotion to Buy when all gates clear.
                </p>
              )}
            </div>
            <span className="shrink-0 text-xs font-semibold opacity-60 ml-auto">
              {vmsAssessment.score}/100
            </span>
          </div>
        )}

        {/* Insider cluster-buy chip (Task #74) — only rendered when ≥2
            distinct C-suite insiders made open-market purchases in 90 days.
            Same visual weight as the VMS chip; no section headers. */}
        {insiderTier === 'cluster-buy' && (
          <div
            className="mt-3 flex items-start gap-2 rounded-md border px-3 py-2.5 border-teal-200 bg-teal-50 text-teal-800"
            data-testid="verdict-insider-chip"
          >
            <TrendingUp className="h-4 w-4 shrink-0 mt-0.5 opacity-70" />
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-snug">Cluster Insider Buy</p>
              <p className="text-xs mt-0.5 opacity-80">
                ≥2 C-suite open-market purchases in 90 days — management is putting personal capital in at current prices (Lakonishok &amp; Lee 2001).
              </p>
            </div>
          </div>
        )}

        {/* Fed rate caution (Task #31). Informational only — surfaces when
            the macro environment is Rising and the stock is growth-tilted
            (low FCF yield, high P/E, or near-52w-high). Never gates the
            Buy/Watch/Pass verdict above. */}
        {shouldShowFedRateCaution(stockData, fedRateEnvironment) && (
          <div
            className="mt-4 flex items-start bg-rose-50 border border-rose-100 rounded-md p-3"
            data-testid="verdict-fed-rate-caution"
          >
            <AlertTriangle className="w-4 h-4 text-rose-600 mr-2 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-rose-800 italic">
              <span className="font-semibold not-italic">Macro context:</span>{' '}
              Fed funds rate is rising
              {fedRateEnvironment
                ? ` (${fedRateEnvironment.currentRate.toFixed(2)}%, ${fedRateEnvironment.deltaBp > 0 ? '+' : ''}${fedRateEnvironment.deltaBp}bp YoY)`
                : ''}{' '}
              and this stock is growth-tilted — historically, growth names
              have lagged by roughly ~10pp in the year after a hiking cycle
              kicks in. Informational only; the verdict above is unchanged.
            </p>
          </div>
        )}

        {/* Circle of competence reminder — the framework's first gate is one
            only the user can answer, so we surface it as an explicit prompt
            rather than guessing on the user's behalf. */}
        <div className="mt-4 flex items-start bg-blue-50 border border-blue-100 rounded-md p-3">
          <CircleHelp className="w-4 h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-800">
            <span className="font-semibold">Circle of competence (gate 1):</span>{' '}
            Can you explain in two sentences how {stockData.symbol} makes money and what could disrupt it?
            If not, the disciplined answer is "Outside Circle of Competence — pass," regardless of the verdict above.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default ValueInvestorVerdict;
