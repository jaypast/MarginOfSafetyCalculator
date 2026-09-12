import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyValuationOutcome,
  trackDecisionFunnelEvent,
} from '../client/src/lib/analytics';

describe('decision funnel analytics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends only allowlisted dimensions and drops user content', () => {
    const track = vi.fn();
    vi.stubGlobal('window', { umami: { track } });

    trackDecisionFunnelEvent('report_generated', {
      method: 'dcf',
      outcome: 'undervalued',
      format: 'show_work',
      location: 'valuation_results',
      ticker: 'PRIVATE_INPUT',
      reportContent: 'free-form report text',
    } as Parameters<typeof trackDecisionFunnelEvent<'report_generated'>>[1]);

    expect(track).toHaveBeenCalledWith('report_generated', {
      method: 'dcf',
      outcome: 'undervalued',
      format: 'show_work',
      location: 'valuation_results',
    });
  });

  it('classifies valuation outcomes into stable segments', () => {
    expect(classifyValuationOutcome(100, -10)).toBe('undervalued');
    expect(classifyValuationOutcome(100, 0)).toBe('fairly_valued');
    expect(classifyValuationOutcome(100, 10)).toBe('overvalued');
    expect(classifyValuationOutcome(0, 10)).toBe('unavailable');
    expect(classifyValuationOutcome(100, Number.NaN)).toBe('unavailable');
  });

  it('does not let analytics failures affect the app', () => {
    vi.stubGlobal('window', {
      umami: {
        track: () => {
          throw new Error('tracker unavailable');
        },
      },
    });

    expect(() => {
      trackDecisionFunnelEvent('stock_search_submitted', {
        location: 'calculator',
      });
    }).not.toThrow();
  });
});