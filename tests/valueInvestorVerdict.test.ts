import { describe, it, expect } from 'vitest';
import {
  evaluateMarginOfSafety,
  evaluateReverseDcf,
  decideVerdict,
  isOutsideCircleSignal,
  buildInversionRisks,
  evaluateCashQuality,
  evaluateInvestmentAffordability,
  evaluate52WeekRange,
} from '@/components/ValueInvestorVerdict';
import type { StockData, ValuationResult, ReverseDCFResult } from '@/lib/types';

// Apple-shaped happy-path stock — high ROE, low debt, real growth.
function makeStock(overrides: Partial<StockData> = {}): StockData {
  return {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 170,
    eps: 6,
    peRatio: 28,
    fcfPerShare: 6.5,
    growthRate: 8,
    roe: 35,
    debtToEquity: 1.2,
    currentRatio: 1.0,
    revenueGrowth: 7,
    earningsStability: 'High',
    competitivePosition: 'Strong',
    ...overrides,
  };
}

function makeAvg(intrinsicValue: number, currentPrice: number): ValuationResult {
  const discountPremium = ((currentPrice - intrinsicValue) / intrinsicValue) * 100;
  return {
    method: 'Average',
    intrinsicValue,
    buyBelow: intrinsicValue * 0.7,
    discountPremium: parseFloat(discountPremium.toFixed(2)),
  };
}

function makeMethods(values: number[]): ValuationResult[] {
  const labels = ['DCF Analysis', 'P/E Based', 'Graham Formula'];
  return values.map((v, i) => ({
    method: labels[i] ?? `Method ${i}`,
    intrinsicValue: v,
    buyBelow: v * 0.7,
    discountPremium: 0,
  }));
}

describe('ValueInvestorVerdict — gate logic', () => {
  describe('evaluateMarginOfSafety', () => {
    it('returns "adequate" when current price discount meets the recommended MoS', () => {
      // 30 % discount vs. recommended 25 % → adequate
      const avg = makeAvg(100, 70);
      const result = evaluateMarginOfSafety(avg, 25);
      expect(result.status).toBe('adequate');
      expect(result.currentDiscountPct).toBeCloseTo(30, 1);
      expect(result.shortfallPts).toBe(0);
    });

    it('returns "inadequate" when discount exists but is below the recommended MoS', () => {
      // 10 % discount vs. recommended 30 % → inadequate, needs 20 pts more
      const avg = makeAvg(100, 90);
      const result = evaluateMarginOfSafety(avg, 30);
      expect(result.status).toBe('inadequate');
      expect(result.currentDiscountPct).toBeCloseTo(10, 1);
      expect(result.shortfallPts).toBeCloseTo(20, 1);
    });

    it('returns "negative" when current price is above intrinsic value', () => {
      const avg = makeAvg(100, 120);
      const result = evaluateMarginOfSafety(avg, 25);
      expect(result.status).toBe('negative');
      expect(result.currentDiscountPct).toBeLessThan(0);
    });

    it('falls back to "inadequate" when no usable intrinsic value is available', () => {
      const result = evaluateMarginOfSafety(undefined, 25);
      expect(result.status).toBe('inadequate');
      expect(result.shortfallPts).toBe(25);
    });
  });

  describe('evaluateReverseDcf', () => {
    it('flags above_max status as heroic', () => {
      const reverse: ReverseDCFResult = {
        impliedGrowthRate: 50,
        status: 'above_max',
        interpretation: '',
        appliedAdjustments: [],
      };
      expect(evaluateReverseDcf(makeStock(), reverse).check).toBe('heroic');
    });

    it('treats implied growth ≥ 25% as heroic even when bisection solved', () => {
      const reverse: ReverseDCFResult = {
        impliedGrowthRate: 28,
        status: 'solved',
        interpretation: '',
        appliedAdjustments: [],
      };
      expect(evaluateReverseDcf(makeStock({ growthRate: 10 }), reverse).check).toBe('heroic');
    });

    it('flags implied growth ≥ 7 pts above historical as aggressive', () => {
      const reverse: ReverseDCFResult = {
        impliedGrowthRate: 18,
        status: 'solved',
        interpretation: '',
        appliedAdjustments: [],
      };
      expect(evaluateReverseDcf(makeStock({ growthRate: 8 }), reverse).check).toBe('aggressive');
    });

    it('treats in-line implied vs historical as reasonable', () => {
      const reverse: ReverseDCFResult = {
        impliedGrowthRate: 9,
        status: 'solved',
        interpretation: '',
        appliedAdjustments: [],
      };
      expect(evaluateReverseDcf(makeStock({ growthRate: 8 }), reverse).check).toBe('reasonable');
    });

    it('returns unavailable when reverse DCF could not be computed', () => {
      const reverse: ReverseDCFResult = {
        impliedGrowthRate: -1,
        status: 'not_applicable',
        interpretation: 'no data',
        appliedAdjustments: [],
      };
      expect(evaluateReverseDcf(makeStock(), reverse).check).toBe('unavailable');
      expect(evaluateReverseDcf(makeStock(), null).check).toBe('unavailable');
    });
  });

  describe('decideVerdict — mirrors the skill\'s gate order', () => {
    const methods = makeMethods([100, 95, 90]); // tight cluster, no outside-circle signal

    it('returns BUY when MoS is adequate, quality is decent, and reverse-DCF is reasonable', () => {
      const verdict = decideVerdict(
        'Good',
        'adequate',
        'reasonable',
        makeAvg(100, 70),
        methods,
        false,
        false,
      );
      expect(verdict.action).toBe('BUY');
    });

    it('returns PASS when implied growth is heroic and the rest is mediocre', () => {
      // Caution quality + heroic implied growth → PASS regardless of MoS.
      const verdict = decideVerdict(
        'Caution',
        'adequate',
        'heroic',
        makeAvg(100, 70),
        methods,
        false,
        false,
      );
      expect(verdict.action).toBe('PASS');
    });

    it('returns WATCH when MoS is met but reverse-DCF is heroic on a quality business', () => {
      const verdict = decideVerdict(
        'Exceptional',
        'adequate',
        'heroic',
        makeAvg(100, 70),
        methods,
        false,
        false,
      );
      expect(verdict.action).toBe('WATCH');
    });

    it('returns WATCH when MoS is inadequate regardless of quality', () => {
      const verdict = decideVerdict(
        'Exceptional',
        'inadequate',
        'reasonable',
        makeAvg(100, 90),
        methods,
        false,
        false,
      );
      expect(verdict.action).toBe('WATCH');
    });

    it('returns PASS when current price is above intrinsic value (negative MoS)', () => {
      const verdict = decideVerdict(
        'Exceptional',
        'negative',
        'reasonable',
        makeAvg(100, 120),
        methods,
        false,
        false,
      );
      expect(verdict.action).toBe('PASS');
    });

    it('returns OUTSIDE_CIRCLE when the methods disagree wildly and the model leaned on caps/fallbacks', () => {
      // 4× spread across DCF / P/E / Graham → wild disagreement.
      const wildMethods = makeMethods([400, 100, 80]);
      const verdict = decideVerdict(
        'Caution',
        'adequate',
        'reasonable',
        makeAvg(193, 100), // 48% discount vs. average
        wildMethods,
        true,
        false,
      );
      expect(verdict.action).toBe('OUTSIDE_CIRCLE');
    });
  });

  describe('isOutsideCircleSignal', () => {
    it('does not fire on a tight method cluster with no other warning signals', () => {
      const tight = makeMethods([100, 95, 105]);
      expect(isOutsideCircleSignal('Good', tight, false, false)).toBe(false);
      // Even with heavy adjustments alone, a Good-quality tight cluster is fine
      expect(isOutsideCircleSignal('Good', tight, true, false)).toBe(false);
    });

    it('fires when method spread is ≥ 4× and quality is caution', () => {
      const wide = makeMethods([400, 100, 80]);
      expect(isOutsideCircleSignal('Caution', wide, false, false)).toBe(true);
    });

    it('fires when method spread is ≥ 4× and the model leaned heavily on adjustments', () => {
      const wide = makeMethods([400, 100, 80]);
      expect(isOutsideCircleSignal('Good', wide, true, false)).toBe(true);
    });

    it('fires when caution + heavy adjustments + source divergence all coincide (even with a tight spread)', () => {
      const tight = makeMethods([100, 95, 105]);
      expect(isOutsideCircleSignal('Caution', tight, true, true)).toBe(true);
    });
  });

  describe('buildInversionRisks', () => {
    it('always returns exactly 3 risks even for a clean stock', () => {
      const risks = buildInversionRisks(makeStock(), makeAvg(100, 70), null, 'Good', false);
      expect(risks).toHaveLength(3);
    });

    it('surfaces high-severity risks first (balance-sheet stress before stagnant growth)', () => {
      const risks = buildInversionRisks(
        makeStock({ debtToEquity: 3.0, revenueGrowth: 1 }),
        makeAvg(100, 70),
        null,
        'Average',
        false,
      );
      expect(risks[0].label.toLowerCase()).toContain('balance-sheet');
    });

    it('flags heroic market expectations when reverse DCF says above_max', () => {
      const reverse: ReverseDCFResult = {
        impliedGrowthRate: 50,
        status: 'above_max',
        interpretation: '',
        appliedAdjustments: [],
      };
      const risks = buildInversionRisks(makeStock(), makeAvg(100, 70), reverse, 'Good', false);
      expect(risks.some(r => r.label.toLowerCase().includes('heroic'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------
  // Task #30 — Yartseva (2025) multibagger empirics
  // -----------------------------------------------------------------
  describe('evaluateCashQuality (FCF gate)', () => {
    const withSignals = (fcfYield: number | null) =>
      makeStock({
        multibaggerSignals: {
          fcfYield,
          assetGrowth: null,
          ebitdaGrowth: null,
          week52High: null,
          week52Low: null,
        },
      });

    it('classifies fcfYield > 5% as strong', () => {
      expect(evaluateCashQuality(withSignals(6.0)).status).toBe('strong');
    });

    it('classifies fcfYield ≤ 0 as negative (boundary at 0)', () => {
      expect(evaluateCashQuality(withSignals(0)).status).toBe('negative');
      expect(evaluateCashQuality(withSignals(-2.5)).status).toBe('negative');
    });

    it('classifies positive yield ≤ 5% as neutral (boundary at 5)', () => {
      expect(evaluateCashQuality(withSignals(5.0)).status).toBe('neutral');
      expect(evaluateCashQuality(withSignals(3.5)).status).toBe('neutral');
    });

    it('falls back to fcfPerShare/price when multibaggerSignals.fcfYield is missing', () => {
      // 6 / 100 = 6% → strong
      const stock = makeStock({ price: 100, fcfPerShare: 6, multibaggerSignals: null });
      expect(evaluateCashQuality(stock).status).toBe('strong');
    });

    it('returns unknown when nothing is computable', () => {
      const stock = makeStock({ price: 0, fcfPerShare: 0, multibaggerSignals: null });
      expect(evaluateCashQuality(stock).status).toBe('unknown');
      expect(evaluateCashQuality(stock).fcfYieldPct).toBeNull();
    });
  });

  describe('evaluateInvestmentAffordability', () => {
    const withGrowth = (assetGrowth: number | null, ebitdaGrowth: number | null) =>
      makeStock({
        multibaggerSignals: {
          fcfYield: null,
          assetGrowth,
          ebitdaGrowth,
          week52High: null,
          week52Low: null,
        },
      });

    it('flags chip when assetGrowth > ebitdaGrowth', () => {
      expect(evaluateInvestmentAffordability(withGrowth(12, 5))).not.toBeNull();
    });

    it('returns null when assetGrowth <= ebitdaGrowth', () => {
      expect(evaluateInvestmentAffordability(withGrowth(5, 10))).toBeNull();
      expect(evaluateInvestmentAffordability(withGrowth(5, 5))).toBeNull();
    });

    it('returns null when either growth value is missing', () => {
      expect(evaluateInvestmentAffordability(withGrowth(null, 5))).toBeNull();
      expect(evaluateInvestmentAffordability(withGrowth(12, null))).toBeNull();
      expect(evaluateInvestmentAffordability(makeStock({ multibaggerSignals: null }))).toBeNull();
    });
  });

  describe('evaluate52WeekRange', () => {
    const ranged = (price: number, low = 50, high = 150) =>
      makeStock({
        price,
        multibaggerSignals: {
          fcfYield: null,
          assetGrowth: null,
          ebitdaGrowth: null,
          week52High: high,
          week52Low: low,
        },
      });

    it('flags chip when price is in the upper 80%+ of the range (boundary at 80%)', () => {
      // 140 → (140-50)/(150-50) = 90% → flag
      expect(evaluate52WeekRange(ranged(140)).chip).not.toBeNull();
      // 100% (at the 52w-high) → flag
      expect(evaluate52WeekRange(ranged(150)).chip).not.toBeNull();
    });

    it('does not flag at or below 80% of the range', () => {
      // 130 → exactly 80% → no flag
      expect(evaluate52WeekRange(ranged(130)).chip).toBeNull();
      // 100 → 50% → no flag
      expect(evaluate52WeekRange(ranged(100)).chip).toBeNull();
      // 50 → 0% (at the 52w-low) → no flag
      expect(evaluate52WeekRange(ranged(50)).chip).toBeNull();
    });

    it('returns null rangePct when 52-week values are missing or degenerate', () => {
      expect(evaluate52WeekRange(makeStock()).rangePct).toBeNull();
      expect(evaluate52WeekRange(makeStock({ multibaggerSignals: null })).rangePct).toBeNull();
      // high <= low is degenerate
      expect(
        evaluate52WeekRange(
          makeStock({
            multibaggerSignals: {
              fcfYield: null,
              assetGrowth: null,
              ebitdaGrowth: null,
              week52High: 100,
              week52Low: 100,
            },
          }),
        ).chip,
      ).toBeNull();
    });
  });

  describe('decideVerdict — Yartseva FCF gate + chip downgrades', () => {
    const methods = makeMethods([100, 100, 100]);

    it('downgrades a base BUY to WATCH when FCF yield is non-positive', () => {
      const v = decideVerdict(
        'Good',
        'adequate',
        'reasonable',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'negative',
        0,
      );
      expect(v.action).toBe('WATCH');
      expect(v.rationale.toLowerCase()).toContain('cash');
    });

    it('does not escalate a PASS or WATCH when cash quality is negative', () => {
      const passVerdict = decideVerdict(
        'Caution',
        'adequate',
        'heroic',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'negative',
        0,
      );
      expect(passVerdict.action).toBe('PASS');
    });

    it('promotes a base WATCH to BUY when FCF yield is strong, MoS adequate, no chips, non-Caution', () => {
      // Good quality + adequate MoS + aggressive reverse-DCF → base WATCH
      const v = decideVerdict(
        'Good',
        'adequate',
        'aggressive',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'strong',
        0,
      );
      expect(v.action).toBe('BUY');
      expect(v.rationale.toLowerCase()).toContain('multibagger');
    });

    it('does not promote a Caution WATCH', () => {
      const v = decideVerdict(
        'Caution',
        'adequate',
        'reasonable',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'strong',
        0,
      );
      expect(v.action).toBe('WATCH');
    });

    it('does not promote when modifier chips are active', () => {
      const v = decideVerdict(
        'Good',
        'adequate',
        'aggressive',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'strong',
        1,
      );
      expect(v.action).toBe('WATCH');
    });

    it('does not promote when MoS is inadequate (Graham principle wins)', () => {
      const v = decideVerdict(
        'Good',
        'inadequate',
        'reasonable',
        makeAvg(100, 90),
        methods,
        false,
        false,
        'strong',
        0,
      );
      expect(v.action).toBe('WATCH');
    });

    it('does not promote when reverse-DCF is heroic', () => {
      const v = decideVerdict(
        'Good',
        'adequate',
        'heroic',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'strong',
        0,
      );
      // Heroic + adequate + Good → WATCH base; promotion is blocked by heroic gate.
      expect(v.action).toBe('WATCH');
    });

    it('downgrades a base BUY to WATCH when ≥1 modifier chip is active', () => {
      const v = decideVerdict(
        'Good',
        'adequate',
        'reasonable',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'unknown',
        1,
      );
      expect(v.action).toBe('WATCH');
      expect(v.rationale.toLowerCase()).toContain('modifier');
    });

    it('chips never escalate a WATCH or PASS', () => {
      const v = decideVerdict(
        'Exceptional',
        'inadequate',
        'reasonable',
        makeAvg(100, 90),
        methods,
        false,
        false,
        'unknown',
        2,
      );
      expect(v.action).toBe('WATCH');
    });

    it('default trailing args (cashQuality=unknown, chips=0) preserve the legacy 7-arg behavior', () => {
      const legacy = decideVerdict(
        'Good',
        'adequate',
        'reasonable',
        makeAvg(100, 70),
        methods,
        false,
        false,
      );
      expect(legacy.action).toBe('BUY');
    });
  });

  // -----------------------------------------------------------------
  // Task #71 — VMS upgrade pathway (Task #70 additions)
  // -----------------------------------------------------------------
  describe('decideVerdict — VMS upgrade pathway', () => {
    const methods = makeMethods([100, 100, 100]);

    // Good + adequate + aggressive → base WATCH (market expectations aggressive
    // but MoS is met). With vmsScore ≥ 75 + neutral cashQuality + positive FCF
    // the VMS gate should promote to BUY.
    it('promotes WATCH → BUY when VMS score ≥ 75, adequate MoS, neutral cashQuality', () => {
      const v = decideVerdict(
        'Good',
        'adequate',
        'aggressive',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'neutral',  // cashQuality — positive but below 5% threshold
        0,          // modifierChipCount
        80,         // vmsScore ≥ 75
        3,          // fcfPerShare > 0
      );
      expect(v.action).toBe('BUY');
      expect(v.rationale.toLowerCase()).toContain('vms');
    });

    it('does NOT promote when VMS score ≥ 75 but reverse-DCF is heroic', () => {
      // Good + adequate + heroic → base WATCH (heroic but quality ≥ Good).
      // VMS gate checks realityCheck !== 'heroic' — must not fire.
      const v = decideVerdict(
        'Good',
        'adequate',
        'heroic',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'neutral',
        0,
        80,
        3,
      );
      expect(v.action).toBe('WATCH');
    });

    it('does NOT promote when VMS score ≥ 75 but cashQuality is negative', () => {
      // cashQuality 'negative' blocks the VMS gate (cashQuality !== 'negative' check).
      const v = decideVerdict(
        'Good',
        'adequate',
        'aggressive',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'negative',
        0,
        80,
        3,
      );
      expect(v.action).toBe('WATCH');
    });

    it('does NOT promote when VMS score ≥ 75 but modifierChipCount > 0', () => {
      const v = decideVerdict(
        'Good',
        'adequate',
        'aggressive',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'neutral',
        1,   // one modifier chip active
        80,
        3,
      );
      expect(v.action).toBe('WATCH');
    });

    it('does NOT promote when VMS score ≥ 75 but quality is Caution', () => {
      // Caution + adequate + reasonable → base WATCH (quality gate).
      // VMS gate checks quality !== 'Caution' — must not fire.
      const v = decideVerdict(
        'Caution',
        'adequate',
        'reasonable',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'neutral',
        0,
        80,
        3,
      );
      expect(v.action).toBe('WATCH');
    });
  });

  describe('decideVerdict — insider cluster-buy upgrade pathway', () => {
    const methods = makeMethods([100, 100, 100]);

    it('promotes WATCH → BUY when cluster-buy is true and all guards pass', () => {
      const v = decideVerdict(
        'Good',
        'adequate',
        'aggressive',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'neutral',
        0,
        0,
        3,
        true,
      );
      expect(v.action).toBe('BUY');
      expect(v.rationale.toLowerCase()).toContain('insider');
    });

    it('keeps WATCH when cluster-buy is true but MoS is inadequate', () => {
      const v = decideVerdict(
        'Good',
        'inadequate',
        'reasonable',
        makeAvg(100, 90),
        methods,
        false,
        false,
        'neutral',
        0,
        0,
        3,
        true,
      );
      expect(v.action).toBe('WATCH');
    });

    it('keeps WATCH when cluster-buy is true but quality is Caution', () => {
      const v = decideVerdict(
        'Caution',
        'adequate',
        'reasonable',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'neutral',
        0,
        0,
        3,
        true,
      );
      expect(v.action).toBe('WATCH');
    });

    it('keeps WATCH when cluster-buy is true but FCF per share is non-positive', () => {
      const v = decideVerdict(
        'Good',
        'adequate',
        'aggressive',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'neutral',
        0,
        0,
        0,
        true,
      );
      expect(v.action).toBe('WATCH');
    });

    it('keeps WATCH when cluster-buy is true but reverse-DCF is heroic', () => {
      const v = decideVerdict(
        'Good',
        'adequate',
        'heroic',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'neutral',
        0,
        0,
        3,
        true,
      );
      expect(v.action).toBe('WATCH');
    });

    it('keeps WATCH when cluster-buy is true but a modifier chip is active', () => {
      const v = decideVerdict(
        'Good',
        'adequate',
        'aggressive',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'neutral',
        1,
        0,
        3,
        true,
      );
      expect(v.action).toBe('WATCH');
    });

    it('keeps WATCH when cluster-buy is true but cash quality is negative', () => {
      const v = decideVerdict(
        'Good',
        'adequate',
        'aggressive',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'negative',
        0,
        0,
        3,
        true,
      );
      expect(v.action).toBe('WATCH');
    });

    it('keeps a base BUY as BUY without double-promotion', () => {
      const v = decideVerdict(
        'Good',
        'adequate',
        'reasonable',
        makeAvg(100, 70),
        methods,
        false,
        false,
        'neutral',
        0,
        0,
        3,
        true,
      );
      expect(v.action).toBe('BUY');
      expect(v.rationale.toLowerCase()).not.toContain('insider');
    });
  });
});
