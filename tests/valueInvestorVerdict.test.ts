import { describe, it, expect } from 'vitest';
import {
  evaluateMarginOfSafety,
  evaluateReverseDcf,
  decideVerdict,
  isOutsideCircleSignal,
  buildInversionRisks,
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
      // Speculative quality + heroic implied growth → PASS regardless of MoS.
      const verdict = decideVerdict(
        'Speculative',
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
        'Speculative',
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

    it('fires when method spread is ≥ 4× and quality is speculative', () => {
      const wide = makeMethods([400, 100, 80]);
      expect(isOutsideCircleSignal('Speculative', wide, false, false)).toBe(true);
    });

    it('fires when method spread is ≥ 4× and the model leaned heavily on adjustments', () => {
      const wide = makeMethods([400, 100, 80]);
      expect(isOutsideCircleSignal('Good', wide, true, false)).toBe(true);
    });

    it('fires when speculative + heavy adjustments + source divergence all coincide (even with a tight spread)', () => {
      const tight = makeMethods([100, 95, 105]);
      expect(isOutsideCircleSignal('Speculative', tight, true, true)).toBe(true);
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
});
