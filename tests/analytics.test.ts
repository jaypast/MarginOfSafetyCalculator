import { describe, expect, it, vi } from 'vitest';
import { trackEvent } from '../client/src/lib/analytics';

describe('analytics funnel event privacy', () => {
  it('forwards only the approved properties for funnel events', () => {
    const track = vi.fn();
    (globalThis as any).window = { umami: { track } };

    trackEvent('stock_search_submitted', {
      location: 'calculator',
      ticker: 'AAPL',
      price: 200,
    });

    expect(track).toHaveBeenCalledWith('stock_search_submitted', {
      location: 'calculator',
    });
    delete (globalThis as any).window;
  });

  it('does not throw when Umami is not injected', () => {
    delete (globalThis as any).window;
    expect(() => trackEvent('valuation_calculated', {
      outcome: 'success',
      quality_available: true,
      location: 'calculator',
    })).not.toThrow();
  });
});