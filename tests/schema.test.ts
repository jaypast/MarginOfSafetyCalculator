import { describe, it, expect } from 'vitest';
import { stockResponseSchema, DATA_SOURCES, insertFeedbackSchema } from '@shared/schema';

describe('stockResponseSchema', () => {
  it('parses a minimal valid payload (no provenance)', () => {
    const parsed = stockResponseSchema.parse({
      symbol: 'AAPL',
      name: 'Apple',
      price: 100,
      eps: 5,
      peRatio: 20,
      fcfPerShare: 4,
      growthRate: 10,
      roe: 30,
      debtToEquity: 1.5,
      currentRatio: 1.0,
      revenueGrowth: 8,
      earningsStability: 'High',
      competitivePosition: 'Strong',
    });
    expect(parsed.symbol).toBe('AAPL');
    expect(parsed.dataSource).toBeUndefined();
    expect(parsed.fetchedAt).toBeUndefined();
  });

  it('parses a payload that includes provenance fields', () => {
    const parsed = stockResponseSchema.parse({
      symbol: 'AAPL',
      name: 'Apple',
      price: 100,
      eps: 5,
      peRatio: 20,
      fcfPerShare: 4,
      growthRate: 10,
      roe: 30,
      debtToEquity: 1.5,
      currentRatio: 1.0,
      revenueGrowth: 8,
      earningsStability: 'High',
      competitivePosition: 'Strong',
      dataSource: 'yfinance',
      fetchedAt: '2026-04-29T12:00:00.000Z',
      appliedAdjustments: ['FCF estimated as EPS × 0.75'],
    });
    expect(parsed.dataSource).toBe('yfinance');
    expect(parsed.appliedAdjustments).toHaveLength(1);
  });

  it('rejects an unknown dataSource value', () => {
    expect(() =>
      stockResponseSchema.parse({
        symbol: 'AAPL',
        name: 'Apple',
        price: 100,
        eps: 5,
        peRatio: 20,
        fcfPerShare: 4,
        growthRate: 10,
        roe: 30,
        debtToEquity: 1.5,
        currentRatio: 1.0,
        revenueGrowth: 8,
        earningsStability: 'High',
        competitivePosition: 'Strong',
        dataSource: 'bloomberg', // not in DATA_SOURCES
      })
    ).toThrow();
  });

  it('every DATA_SOURCES entry is accepted by the schema', () => {
    for (const src of DATA_SOURCES) {
      expect(() =>
        stockResponseSchema.parse({
          symbol: 'X',
          name: 'X',
          price: 1,
          eps: 1,
          peRatio: 1,
          fcfPerShare: 1,
          growthRate: 1,
          roe: 1,
          debtToEquity: 1,
          currentRatio: 1,
          revenueGrowth: 1,
          earningsStability: 'High',
          competitivePosition: 'Strong',
          dataSource: src,
        })
      ).not.toThrow();
    }
  });
});

describe('insertFeedbackSchema', () => {
  it('accepts a well-formed feedback submission', () => {
    const parsed = insertFeedbackSchema.parse({
      satisfaction: 'very_disappointed',
      mainBenefit: 'Helps me avoid overpaying for stocks',
      idealUser: 'Long-term value investors',
      improvements: 'Add more international stocks',
    });
    expect(parsed.satisfaction).toBe('very_disappointed');
  });
});
