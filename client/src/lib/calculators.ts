import { StockData, ValuationParams, ValuationResult, ReverseDCFResult } from './types';
import { AdjustmentFactors, getAdjustmentFactors, detectDataIssues, describeIndustry } from './companyAdjustments';

// ---------------------------------------------------------------------------
// Detailed valuation outputs
//
// Each calculator returns the intrinsic value AND a list of human-readable
// adjustment notes describing every cap, override, or fallback that was
// applied. This is what the UI surfaces in the "Applied adjustments" panel
// so the user can trust (or contest) each number.
//
// For backward compatibility we also export thin wrappers that return just a
// `number`, so old callers and the existing test signatures stay valid.
// ---------------------------------------------------------------------------

export interface ValuationOutcome {
  value: number;            // Intrinsic value, or -1 when N/A (e.g. negative EPS)
  appliedAdjustments: string[];
}

// Default to NOT applying the Japanese price floor. The opt-in flag exists in
// `ValuationParams.applyJapanFloor` and only fires when the caller explicitly
// asks for it. The previous unconditional floor (65–70 % of current price)
// silently made every JP listing look "fairly valued" — investors couldn't
// see overvaluation even when the model produced one.
const JAPAN_FLOOR_DCF_GRAHAM = 0.65;
const JAPAN_FLOOR_PE = 0.70;

// =============================================================================
// DCF Analysis
// =============================================================================
export const calculateDCFDetailed = (
  stockData: StockData,
  params: ValuationParams
): ValuationOutcome => {
  const adjustmentsLog: string[] = [];
  const { fcfPerShare, eps, symbol, growthRate } = stockData;
  const { dcfGrowthRate, dcfDiscountRate, dcfTerminalMultiple, dcfForecastPeriod } = params;

  const adjustments = getAdjustmentFactors(stockData);
  const dataIssues = detectDataIssues(stockData);

  let effectiveFCF = fcfPerShare;

  if (dataIssues.hasFcfIssue || dataIssues.hasExtremeFcf) {
    if (eps > 0) {
      effectiveFCF = eps * adjustments.fcfToEpsRatio;
      adjustmentsLog.push(
        `FCF/share missing or extreme — estimated as EPS × ${adjustments.fcfToEpsRatio} (${describeIndustry(stockData)})`
      );
    } else {
      return { value: -1, appliedAdjustments: ['DCF not applicable: FCF and EPS both negative'] };
    }
  }

  if (eps > 0 && effectiveFCF > eps * 3) {
    effectiveFCF = eps * 2.5;
    adjustmentsLog.push('FCF capped at 2.5× EPS (outlier sanity check)');
  }

  let effectiveGrowthRate = dcfGrowthRate > 0 ? dcfGrowthRate : growthRate;
  const cappedGrowthRate = Math.max(2, Math.min(effectiveGrowthRate, adjustments.growthRateCap));
  if (cappedGrowthRate !== effectiveGrowthRate) {
    adjustmentsLog.push(
      `Growth rate ${effectiveGrowthRate.toFixed(1)}% → ${cappedGrowthRate.toFixed(1)}% (capped by ${describeIndustry(stockData)})`
    );
  }
  effectiveGrowthRate = cappedGrowthRate;

  let intrinsicValue = 0;
  let currentFCF = effectiveFCF;
  for (let year = 1; year <= dcfForecastPeriod; year++) {
    const yearGrowthRate = effectiveGrowthRate * Math.pow(0.95, year - 1);
    currentFCF *= (1 + yearGrowthRate / 100);
    const discountFactor = Math.pow(1 + dcfDiscountRate / 100, year);
    intrinsicValue += currentFCF / discountFactor;
  }

  const terminalGrowthRate = Math.min(effectiveGrowthRate * 0.5, 4);
  const terminalFCF = currentFCF * (1 + terminalGrowthRate / 100);

  const effectiveTerminalMultiple = Math.min(dcfTerminalMultiple, adjustments.terminalMultipleCap);
  if (effectiveTerminalMultiple < dcfTerminalMultiple) {
    adjustmentsLog.push(
      `Terminal multiple ${dcfTerminalMultiple} → ${effectiveTerminalMultiple} (capped by ${describeIndustry(stockData)})`
    );
  }

  const terminalValue = (terminalFCF * effectiveTerminalMultiple) /
    Math.pow(1 + dcfDiscountRate / 100, dcfForecastPeriod);
  intrinsicValue += terminalValue;

  const priceFCFRatio = intrinsicValue / effectiveFCF;
  if (priceFCFRatio > adjustments.fcfMultipleCap) {
    intrinsicValue = effectiveFCF * adjustments.fcfMultipleCap;
    adjustmentsLog.push(
      `Implied P/FCF ${priceFCFRatio.toFixed(1)}× exceeds cap ${adjustments.fcfMultipleCap}× — value reduced`
    );
  }

  const maxAllowedValue = stockData.price * adjustments.priceToCap;
  if (intrinsicValue > maxAllowedValue) {
    intrinsicValue = maxAllowedValue;
    adjustmentsLog.push(
      `Intrinsic value capped at ${adjustments.priceToCap}× current price (${describeIndustry(stockData)})`
    );
  }

  if (params.applyJapanFloor && symbol.endsWith('.T')) {
    const minValue = stockData.price * JAPAN_FLOOR_DCF_GRAHAM;
    if (intrinsicValue < minValue) {
      intrinsicValue = minValue;
      adjustmentsLog.push(
        `Japanese floor applied: value raised to ${(JAPAN_FLOOR_DCF_GRAHAM * 100).toFixed(0)}% of current price (opt-in flag set)`
      );
    }
  }

  return {
    value: parseFloat(intrinsicValue.toFixed(2)),
    appliedAdjustments: adjustmentsLog,
  };
};

export const calculateDCF = (stockData: StockData, params: ValuationParams): number =>
  calculateDCFDetailed(stockData, params).value;

// =============================================================================
// P/E Based Valuation
// =============================================================================
export const calculatePEDetailed = (
  stockData: StockData,
  params: ValuationParams
): ValuationOutcome => {
  const adjustmentsLog: string[] = [];
  const { eps, peRatio, growthRate } = stockData;
  const { peType, peCustomValue, peAdjustment } = params;

  const adjustments = getAdjustmentFactors(stockData);

  if (eps <= 0) {
    return { value: -1, appliedAdjustments: ['P/E valuation not applicable: EPS ≤ 0'] };
  }

  let selectedPE: number;

  switch (peType) {
    case 'current':
      if (peRatio > 0) {
        selectedPE = peRatio;
      } else {
        // Fall back to a growth-aware PEG-style estimate rather than a fixed
        // constant: PEG of ~1.5× growth, bounded by industry caps.
        if (growthRate > 0) {
          selectedPE = Math.max(10, Math.min(growthRate * 1.5, adjustments.peMultipleCap));
          adjustmentsLog.push(
            `P/E missing — using growth-derived PEG (${growthRate.toFixed(1)}% × 1.5 = ${selectedPE.toFixed(1)})`
          );
        } else {
          selectedPE = 15;
          adjustmentsLog.push('P/E and growth both missing — falling back to neutral P/E of 15');
        }
      }
      if (selectedPE > adjustments.peMultipleCap) {
        adjustmentsLog.push(
          `P/E ${selectedPE.toFixed(1)} → ${adjustments.peMultipleCap} (capped by ${describeIndustry(stockData)})`
        );
        selectedPE = adjustments.peMultipleCap;
      }
      break;

    case 'custom':
      selectedPE = peCustomValue;
      adjustmentsLog.push(`Using user-supplied custom P/E of ${selectedPE}`);
      break;

    default: {
      // Should be unreachable thanks to the union type, but keep a
      // defensive branch so unknown values don't silently fall through to
      // a hard-coded magic number like the old code did.
      const exhaustive: never = peType;
      adjustmentsLog.push(`Unknown peType "${exhaustive}", defaulting to current P/E`);
      selectedPE = peRatio > 0 ? peRatio : 15;
    }
  }

  const adjustedEPS = eps * (peAdjustment / 100);
  if (peAdjustment !== 100) {
    adjustmentsLog.push(`EPS × ${peAdjustment}% adjustment applied`);
  }

  let intrinsicValue = adjustedEPS * selectedPE;

  const maxAllowedValue = stockData.price * adjustments.priceToCap;
  if (intrinsicValue > maxAllowedValue) {
    intrinsicValue = maxAllowedValue;
    adjustmentsLog.push(
      `Intrinsic value capped at ${adjustments.priceToCap}× current price (${describeIndustry(stockData)})`
    );
  }

  if (params.applyJapanFloor && stockData.symbol.endsWith('.T')) {
    const minValue = stockData.price * JAPAN_FLOOR_PE;
    if (intrinsicValue < minValue) {
      intrinsicValue = minValue;
      adjustmentsLog.push(
        `Japanese floor applied: value raised to ${(JAPAN_FLOOR_PE * 100).toFixed(0)}% of current price (opt-in flag set)`
      );
    }
  }

  return {
    value: parseFloat(intrinsicValue.toFixed(2)),
    appliedAdjustments: adjustmentsLog,
  };
};

export const calculatePE = (stockData: StockData, params: ValuationParams): number =>
  calculatePEDetailed(stockData, params).value;

// =============================================================================
// Graham Formula
// =============================================================================
export const calculateGrahamDetailed = (
  stockData: StockData,
  params: ValuationParams
): ValuationOutcome => {
  const adjustmentsLog: string[] = [];
  const { eps, growthRate } = stockData;
  const { grahamGrowthRate, grahamBaseValue } = params;

  const adjustments = getAdjustmentFactors(stockData);

  if (eps <= 0) {
    return { value: -1, appliedAdjustments: ['Graham valuation not applicable: EPS ≤ 0'] };
  }

  const effectiveGrowthRate = grahamGrowthRate > 0
    ? grahamGrowthRate
    : (growthRate > 0 ? growthRate : 7);

  const cappedGrowthRate = Math.min(effectiveGrowthRate, Math.min(20, adjustments.growthRateCap));
  if (cappedGrowthRate < effectiveGrowthRate) {
    adjustmentsLog.push(
      `Growth rate ${effectiveGrowthRate.toFixed(1)}% → ${cappedGrowthRate.toFixed(1)}% (Graham 20% cap and ${describeIndustry(stockData)})`
    );
  }

  let intrinsicValue = eps * (grahamBaseValue + (2 * cappedGrowthRate));

  const impliedPE = intrinsicValue / eps;
  if (impliedPE > adjustments.peMultipleCap) {
    intrinsicValue = eps * adjustments.peMultipleCap;
    adjustmentsLog.push(
      `Implied P/E ${impliedPE.toFixed(1)} exceeds cap ${adjustments.peMultipleCap} (${describeIndustry(stockData)}) — value reduced`
    );
  }

  const maxAllowedValue = stockData.price * adjustments.priceToCap;
  if (intrinsicValue > maxAllowedValue) {
    intrinsicValue = maxAllowedValue;
    adjustmentsLog.push(
      `Intrinsic value capped at ${adjustments.priceToCap}× current price (${describeIndustry(stockData)})`
    );
  }

  if (params.applyJapanFloor && stockData.symbol.endsWith('.T')) {
    const minValue = stockData.price * JAPAN_FLOOR_DCF_GRAHAM;
    if (intrinsicValue < minValue) {
      intrinsicValue = minValue;
      adjustmentsLog.push(
        `Japanese floor applied: value raised to ${(JAPAN_FLOOR_DCF_GRAHAM * 100).toFixed(0)}% of current price (opt-in flag set)`
      );
    }
  }

  return {
    value: parseFloat(intrinsicValue.toFixed(2)),
    appliedAdjustments: adjustmentsLog,
  };
};

export const calculateGraham = (stockData: StockData, params: ValuationParams): number =>
  calculateGrahamDetailed(stockData, params).value;

// =============================================================================
// Helpers used outside the per-method calculators
// =============================================================================
export const calculateBuyBelow = (
  intrinsicValue: number,
  marginOfSafety: number
): number => {
  if (intrinsicValue <= 0) {
    return 0.01;
  }
  const buyBelow = intrinsicValue * (1 - marginOfSafety / 100);
  return parseFloat(buyBelow.toFixed(2));
};

export const calculateDiscountPremium = (
  currentPrice: number,
  comparePrice: number
): number => {
  if (comparePrice <= 0) {
    return 100;
  }
  const discountPremium = ((currentPrice - comparePrice) / comparePrice) * 100;
  return parseFloat(discountPremium.toFixed(1));
};

export const calculateBuyBelowStatus = (
  currentPrice: number,
  buyBelowPrice: number
): number => {
  if (buyBelowPrice <= 0) {
    return 100;
  }
  const discountPremium = ((currentPrice - buyBelowPrice) / buyBelowPrice) * 100;
  return parseFloat(discountPremium.toFixed(1));
};

/**
 * Calculate the average across multiple valuation methods.
 *
 * Now requires the *real* current price rather than reverse-engineering it
 * from `discountPremium` (which silently produced wrong numbers when one of
 * the input methods was capped). Pass `stockData.price` from the caller.
 */
export const calculateAverageValuation = (
  valuationResults: ValuationResult[],
  currentPrice: number
): ValuationResult => {
  if (valuationResults.length === 0) {
    return {
      method: 'Average',
      intrinsicValue: 0,
      buyBelow: 0,
      discountPremium: 0,
    };
  }

  const validResults = valuationResults.filter(result => result.intrinsicValue > 0);

  if (validResults.length === 0) {
    return {
      method: 'Average',
      intrinsicValue: -1,
      buyBelow: 0.01,
      discountPremium: 100,
    };
  }

  const sumIntrinsicValue = validResults.reduce((sum, result) => sum + result.intrinsicValue, 0);
  const sumBuyBelow = validResults.reduce((sum, result) => sum + result.buyBelow, 0);

  const avgIntrinsicValue = parseFloat((sumIntrinsicValue / validResults.length).toFixed(2));
  const avgBuyBelow = parseFloat((sumBuyBelow / validResults.length).toFixed(2));

  const avgDiscountPremium = calculateDiscountPremium(currentPrice, avgIntrinsicValue);
  const avgBuyBelowStatus = calculateBuyBelowStatus(currentPrice, avgBuyBelow);

  return {
    method: 'Average',
    intrinsicValue: avgIntrinsicValue,
    buyBelow: avgBuyBelow,
    discountPremium: avgDiscountPremium,
    buyBelowStatus: avgBuyBelowStatus,
  };
};

/**
 * Cross-source agreement check.
 *
 * Returns a normalized agreement score (0..1) plus per-field discrepancies,
 * where 1.0 means "the two payloads agree on every checked field within
 * tolerance" and 0 means "they disagree on every field".
 *
 * Use this to decide whether to trust a primary fetch or to surface a
 * "data sources disagree" warning in the UI when running validation.
 */
export interface CrossSourceComparison {
  agreement: number;          // 0..1
  fieldsCompared: number;
  discrepancies: Array<{ field: string; a: number; b: number; deltaPct: number }>;
}

export const compareDataSources = (
  a: Pick<StockData, 'price' | 'eps' | 'peRatio' | 'fcfPerShare' | 'growthRate'>,
  b: Pick<StockData, 'price' | 'eps' | 'peRatio' | 'fcfPerShare' | 'growthRate'>,
  tolerancePct = 5
): CrossSourceComparison => {
  const fields: Array<keyof typeof a> = ['price', 'eps', 'peRatio', 'fcfPerShare', 'growthRate'];
  let agreed = 0;
  let compared = 0;
  const discrepancies: CrossSourceComparison['discrepancies'] = [];

  for (const field of fields) {
    const va = a[field];
    const vb = b[field];
    // Skip fields where either side is zero/missing — we can't meaningfully
    // compare them.
    if (!va || !vb) continue;
    compared++;
    const denom = Math.max(Math.abs(va), Math.abs(vb));
    const deltaPct = denom === 0 ? 0 : (Math.abs(va - vb) / denom) * 100;
    if (deltaPct <= tolerancePct) {
      agreed++;
    } else {
      discrepancies.push({ field, a: va, b: vb, deltaPct: parseFloat(deltaPct.toFixed(2)) });
    }
  }

  return {
    agreement: compared === 0 ? 0 : agreed / compared,
    fieldsCompared: compared,
    discrepancies,
  };
};

// =============================================================================
// Reverse DCF
//
// The forward DCF answers "given a growth assumption, what is this stock
// worth?". The reverse DCF answers the inverse: "given today's price, what
// growth rate is the market actually pricing in?". A useful sanity check —
// if the implied growth is wildly above the company's actual track record,
// the market may be too optimistic; if it's well below, there may be an
// opportunity (or a problem the model isn't capturing).
//
// Implementation: bisection on the growth rate over [-50, 100] %. The NPV
// model used here mirrors `calculateDCFDetailed` (same 0.95^year decay, same
// terminal-multiple cap, same FCF and priceToCap ceilings, same FCF/EPS
// fallback) — EXCEPT it does not cap the growth rate input, since growth is
// the variable we are solving for. NPV(g) is monotonically increasing in g
// for healthy inputs, so bisection is well-behaved.
// =============================================================================

// Bisection clamps the implied growth rate within ±50 %. Anything outside
// that band is reported with a `>50 %` / `<-50 %` label rather than a
// spurious bisection result — per spec, a model that requires growth above
// 50 % to justify the price has effectively given up on the price.
const REVERSE_DCF_MIN_GROWTH = -50;
const REVERSE_DCF_MAX_GROWTH = 50;
const REVERSE_DCF_ITERATIONS = 60;
// Bisection halts once price is matched within this relative tolerance.
// 0.1 % is far tighter than the financial inputs themselves.
const REVERSE_DCF_PRICE_TOLERANCE_PCT = 0.1;

/**
 * Project DCF NPV at an arbitrary growth rate. Mirrors the structure of
 * `calculateDCFDetailed` (FCF estimation, terminal cap, FCF cap, priceToCap)
 * but takes the growth rate as a raw parameter instead of capping it — that
 * is essential for the reverse-DCF solver, otherwise every g above the
 * industry growth cap would map to the same NPV and the bisection would
 * collapse to the cap value for every aggressive case.
 */
function projectReverseDcfNpv(
  stockData: StockData,
  params: ValuationParams,
  growthRate: number,
  effectiveFCF: number,
  adjustments: AdjustmentFactors,
): number {
  const { dcfDiscountRate, dcfTerminalMultiple, dcfForecastPeriod } = params;
  const effectiveTerminalMultiple = Math.min(dcfTerminalMultiple, adjustments.terminalMultipleCap);

  let intrinsicValue = 0;
  let currentFCF = effectiveFCF;
  for (let year = 1; year <= dcfForecastPeriod; year++) {
    const yearGrowthRate = growthRate * Math.pow(0.95, year - 1);
    currentFCF *= (1 + yearGrowthRate / 100);
    const discountFactor = Math.pow(1 + dcfDiscountRate / 100, year);
    intrinsicValue += currentFCF / discountFactor;
  }

  const terminalGrowthRate = Math.min(growthRate * 0.5, 4);
  const terminalFCF = currentFCF * (1 + terminalGrowthRate / 100);
  const terminalValue = (terminalFCF * effectiveTerminalMultiple) /
    Math.pow(1 + dcfDiscountRate / 100, dcfForecastPeriod);
  intrinsicValue += terminalValue;

  // FCF multiple ceiling — mirrors forward DCF's outlier guard.
  if (effectiveFCF > 0) {
    const priceFCFRatio = intrinsicValue / effectiveFCF;
    if (priceFCFRatio > adjustments.fcfMultipleCap) {
      intrinsicValue = effectiveFCF * adjustments.fcfMultipleCap;
    }
  }

  // priceToCap ceiling — mirrors forward DCF. Note: for the reverse DCF this
  // rarely binds because we are targeting NPV = current price < priceToCap ×
  // current price, but mirroring it keeps the forward / reverse math in sync.
  const maxAllowedValue = stockData.price * adjustments.priceToCap;
  if (intrinsicValue > maxAllowedValue) {
    intrinsicValue = maxAllowedValue;
  }

  return intrinsicValue;
}

export const calculateReverseDCFDetailed = (
  stockData: StockData,
  params: ValuationParams,
): ReverseDCFResult => {
  const adjustmentsLog: string[] = [];
  const { fcfPerShare, eps, price, growthRate } = stockData;

  if (price <= 0) {
    return {
      impliedGrowthRate: -1,
      status: 'not_applicable',
      interpretation: 'Reverse DCF not applicable: current price is non-positive',
      appliedAdjustments: ['Reverse DCF not applicable: current price ≤ 0'],
    };
  }

  // Strict precondition: reverse DCF requires real free cash flow. Unlike
  // the forward DCF (which falls back to EPS × industry ratio when FCF is
  // missing), the reverse solver is meant to tell investors what the
  // *market* is pricing in — substituting a derived FCF would silently
  // change the question being answered. So we refuse to run when FCF ≤ 0.
  if (fcfPerShare <= 0) {
    return {
      impliedGrowthRate: -1,
      status: 'not_applicable',
      interpretation: 'Reverse DCF not applicable: FCF non-positive',
      appliedAdjustments: ['Reverse DCF not applicable: FCF non-positive'],
    };
  }

  const adjustments = getAdjustmentFactors(stockData);

  let effectiveFCF = fcfPerShare;
  if (eps > 0 && effectiveFCF > eps * 3) {
    effectiveFCF = eps * 2.5;
    adjustmentsLog.push('FCF capped at 2.5× EPS (outlier sanity check)');
  }

  // Bracket check — if even the extremes can't reach the price, report
  // gracefully instead of returning a spurious bisection result.
  const npvAtMin = projectReverseDcfNpv(stockData, params, REVERSE_DCF_MIN_GROWTH, effectiveFCF, adjustments);
  const npvAtMax = projectReverseDcfNpv(stockData, params, REVERSE_DCF_MAX_GROWTH, effectiveFCF, adjustments);

  if (npvAtMax < price) {
    adjustmentsLog.push(
      `Implied growth exceeds ${REVERSE_DCF_MAX_GROWTH}% — current price is above what even an aggressive growth assumption justifies (likely the FCF or priceToCap ceiling is binding)`
    );
    return {
      impliedGrowthRate: REVERSE_DCF_MAX_GROWTH,
      status: 'above_max',
      interpretation: `Market is pricing in growth above ${REVERSE_DCF_MAX_GROWTH}% — even an aggressive growth assumption can't justify the current price under this model`,
      appliedAdjustments: adjustmentsLog,
    };
  }

  if (npvAtMin > price) {
    adjustmentsLog.push(
      `Implied growth below ${REVERSE_DCF_MIN_GROWTH}% — current price is below what even a steeply negative growth assumption produces`
    );
    return {
      impliedGrowthRate: REVERSE_DCF_MIN_GROWTH,
      status: 'below_min',
      interpretation: `Market is pricing in growth below ${REVERSE_DCF_MIN_GROWTH}% — possibly an opportunity, possibly a sign the model isn't capturing the company's situation`,
      appliedAdjustments: adjustmentsLog,
    };
  }

  // Bisection — NPV(g) is monotonically increasing in g for the inputs that
  // pass the bracket check above, so the standard bisection invariant holds.
  let lo = REVERSE_DCF_MIN_GROWTH;
  let hi = REVERSE_DCF_MAX_GROWTH;
  let mid = (lo + hi) / 2;
  for (let i = 0; i < REVERSE_DCF_ITERATIONS; i++) {
    mid = (lo + hi) / 2;
    const npv = projectReverseDcfNpv(stockData, params, mid, effectiveFCF, adjustments);
    if (Math.abs(npv - price) / price < REVERSE_DCF_PRICE_TOLERANCE_PCT / 100) break;
    if (npv < price) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const impliedGrowthRate = parseFloat(mid.toFixed(2));

  // Build a one-line interpretation comparing the implied rate to the
  // company's actual historical growth. Skip the comparison if historical
  // growth is missing or non-positive.
  let interpretation: string;
  if (growthRate > 0) {
    const gap = parseFloat((impliedGrowthRate - growthRate).toFixed(1));
    if (Math.abs(gap) < 0.5) {
      interpretation =
        `Market is pricing in ${impliedGrowthRate.toFixed(1)}% growth — roughly in line with the company's historical growth (${growthRate.toFixed(1)}%)`;
    } else if (gap > 0) {
      interpretation =
        `Market is pricing in ${impliedGrowthRate.toFixed(1)}% growth — ${Math.abs(gap).toFixed(1)} pts higher than the company's historical growth (${growthRate.toFixed(1)}%). The market is more optimistic than the trailing record.`;
    } else {
      interpretation =
        `Market is pricing in ${impliedGrowthRate.toFixed(1)}% growth — ${Math.abs(gap).toFixed(1)} pts lower than the company's historical growth (${growthRate.toFixed(1)}%). The market is more pessimistic than the trailing record.`;
    }
  } else {
    interpretation = `Market is pricing in ${impliedGrowthRate.toFixed(1)}% growth (no historical growth available to compare against)`;
  }

  return {
    impliedGrowthRate,
    status: 'solved',
    interpretation,
    appliedAdjustments: adjustmentsLog,
  };
};

// Thin number-returning wrapper for symmetry with the other calculators.
// Returns the implied growth rate (%); see `calculateReverseDCFDetailed` for
// the full result including status and interpretation.
export const calculateReverseDCF = (
  stockData: StockData,
  params: ValuationParams,
): number => calculateReverseDCFDetailed(stockData, params).impliedGrowthRate;
