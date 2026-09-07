import { describe, expect, it } from 'vitest';
import {
  COMPANY_QUALITY_VERSION,
  evaluateCompanyQuality,
  isResearchQuality,
} from '../shared/companyQuality';
import { computeStockQuality } from '../client/src/lib/researchCalculations';
import { computeQuality, hasUsableQualityMetrics } from '../server/services/researchScan';

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
    expect(result.quality).toBe('Speculative');
    expect(result.reasons.join(' ')).toContain('severe-risk ceiling');
    expect(isResearchQuality(result.quality)).toBe(false);
  });

  it('makes weak liquidity and low ROE hard risk overrides', () => {
    expect(evaluateCompanyQuality({ ...strongCompany, currentRatio: 0.9 }).quality).toBe('Speculative');
    expect(evaluateCompanyQuality({ ...strongCompany, roe: 9.9 }).quality).toBe('Speculative');
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
    expect(after.quality).toBe('Speculative');
  });
});