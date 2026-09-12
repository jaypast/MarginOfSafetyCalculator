import { describe, expect, it } from 'vitest';
import {
  COMPANY_QUALITY_VERSION,
  evaluateCompanyQuality,
  isResearchQuality,
  normalizeCompanyQuality,
} from '../shared/companyQuality';
import { computeStockQuality } from '../client/src/lib/researchCalculations';
import { computeQuality, hasUsableQualityMetrics } from '../server/services/researchScan';
import { getDefaultMarginOfSafety, getRecommendedMarginOfSafety } from '../client/src/lib/utils';

const strongCompany = {
  roe: 30.7,
  debtToEquity: 0.4,
  currentRatio: 1.5,
  revenueGrowth: 61.1,
  earningsStability: 'Low',
  competitivePosition: 'Strong',
};

describe('canonical company quality', () => {
  it('uses all six inputs and returns a versioned explanation', () => {
    const result = evaluateCompanyQuality(strongCompany);
    expect(result.quality).toBe('Exceptional');
    expect(result.score).toBe(16);
    expect(result.version).toBe(COMPANY_QUALITY_VERSION);
    expect(result.reasons[0]).toContain('16/20');
  });

  it('does not let growth and competitive position hide severe leverage', () => {
    const result = evaluateCompanyQuality({ ...strongCompany, debtToEquity: 8 });
    expect(result.score).toBeGreaterThanOrEqual(12);
    expect(result.quality).toBe('Caution');
    expect(result.reasons.join(' ')).toContain('severe-risk ceiling');
    expect(isResearchQuality(result.quality)).toBe(false);
  });

  it('makes weak liquidity and low ROE hard risk overrides', () => {
    expect(evaluateCompanyQuality({ ...strongCompany, currentRatio: 0.9 }).quality).toBe('Caution');
    expect(evaluateCompanyQuality({ ...strongCompany, roe: 9.9 }).quality).toBe('Caution');
  });

  it('returns unavailable instead of silently replacing missing values with zero', () => {
    const result = evaluateCompanyQuality({ ...strongCompany, revenueGrowth: null });
    expect(result.quality).toBeNull();
    expect(result.confidence).toBe('unavailable');
    expect(result.missingInputs).toContain('revenueGrowth');
  });

  it('produces the same classification in client and server adapters', () => {
    const stock = { ...strongCompany, symbol: 'TEST' } as any;
    expect(computeStockQuality(stock)).toBe('Exceptional');
    expect(computeQuality(stock)).toBe('Exceptional');
    expect(hasUsableQualityMetrics(stock)).toBe(true);
  });

  it('recomputes when an effective input changes', () => {
    const before = evaluateCompanyQuality(strongCompany);
    const after = evaluateCompanyQuality({ ...strongCompany, debtToEquity: 8 });
    expect(before.quality).toBe('Exceptional');
    expect(after.quality).toBe('Caution');
  });

  it('translates the legacy persisted label for presentation', () => {
    expect(normalizeCompanyQuality('Speculative')).toBe('Caution');
    expect(normalizeCompanyQuality('Caution')).toBe('Caution');
    expect(normalizeCompanyQuality('unknown')).toBeNull();
  });

  it('keeps the Caution margin recommendation and default aligned', () => {
    expect(getRecommendedMarginOfSafety('Caution')).toBe('40-50%+');
    expect(getDefaultMarginOfSafety('Caution')).toBe(45);
  });

  it('maps every quality tier to the documented margin range and midpoint', () => {
    expect(getRecommendedMarginOfSafety('Exceptional')).toBe('15-25%');
    expect(getDefaultMarginOfSafety('Exceptional')).toBe(20);
    expect(getRecommendedMarginOfSafety('Good')).toBe('25-35%');
    expect(getDefaultMarginOfSafety('Good')).toBe(30);
    expect(getRecommendedMarginOfSafety('Average')).toBe('35-40%');
    expect(getDefaultMarginOfSafety('Average')).toBe(35);
  });
});