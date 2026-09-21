// @vitest-environment happy-dom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockData } from '../client/src/lib/types';

const mocks = vi.hoisted(() => ({
  currentStockData: undefined as StockData | undefined,
  toast: vi.fn(),
  fetchStockData: vi.fn(),
}));

vi.mock('../client/src/hooks/useStockData', () => ({
  useStockData: () => ({
    stockData: mocks.currentStockData,
    isLoading: false,
    isError: false,
    error: null,
    fetchStockData: mocks.fetchStockData,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { environment: null } }),
}));

vi.mock('wouter', () => ({
  useSearch: () => '',
}));

vi.mock('../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('../client/src/lib/analytics', () => ({
  classifyValuationOutcome: () => 'unknown',
  trackDecisionFunnelEvent: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  classifyValuationOutcome: () => 'unknown',
  trackDecisionFunnelEvent: vi.fn(),
}));

vi.mock('../client/src/components/StockInformation', () => ({
  default: () => null,
}));

vi.mock('../client/src/components/KeyMetrics', () => ({
  default: () => null,
}));

vi.mock('../client/src/components/ValuationMethod', () => ({
  default: () => null,
}));

vi.mock('../client/src/components/ValuationResults', () => ({
  default: () => null,
}));

vi.mock('../client/src/components/ValueInvestorVerdict', () => ({
  default: () => null,
}));

vi.mock('../client/src/components/MultibaggerScreener', () => ({
  default: () => null,
}));

vi.mock('../client/src/components/EducationalResources', () => ({
  default: () => null,
}));

vi.mock('../client/src/components/DecisionHeadline', () => ({
  default: () => null,
}));

vi.mock('../client/src/components/SectorWarningCard', () => ({
  default: () => null,
}));

vi.mock('../client/src/components/VmsEducationCard', () => ({
  default: () => null,
}));

vi.mock('../client/src/components/QualityIndicators', () => ({
  default: (props: {
    companyQuality: { quality: string; recommendedMarginOfSafety: string } | null;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'mock-quality' },
      props.companyQuality
        ? `${props.companyQuality.quality}|${props.companyQuality.recommendedMarginOfSafety}`
        : 'unavailable',
    ),
}));

vi.mock('../client/src/components/MarginOfSafetyParams', () => ({
  default: (props: {
    marginOfSafetyParams: { marginOfSafety: number };
    setMarginOfSafetyParams: React.Dispatch<
      React.SetStateAction<{ marginOfSafety: number }>
    >;
  }) =>
    React.createElement('div', { 'data-testid': 'mock-margin-of-safety' }, [
      React.createElement(
        'span',
        { key: 'value', 'data-testid': 'mock-margin-value' },
        `${props.marginOfSafetyParams.marginOfSafety}%`,
      ),
      React.createElement(
        'button',
        {
          key: 'change',
          type: 'button',
          onClick: () => props.setMarginOfSafetyParams({ marginOfSafety: 50 }),
        },
        'Choose 50%',
      ),
    ]),
}));

vi.mock('../client/src/components/ui/collapsible', () => ({
  Collapsible: (props: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', props),
  CollapsibleContent: (props: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', props),
  CollapsibleTrigger: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement>,
  ) => React.createElement('button', props),
}));

import MarginOfSafetyCalculator from '../client/src/components/MarginOfSafetyCalculator';

const makeStock = (
  symbol: string,
  overrides: Partial<StockData> = {},
): StockData => ({
  symbol,
  name: `${symbol} Corporation`,
  price: 100,
  eps: 5,
  peRatio: 20,
  fcfPerShare: 4,
  growthRate: 10,
  roe: 30,
  debtToEquity: 0.2,
  currentRatio: 2,
  revenueGrowth: 20,
  earningsStability: 'High',
  competitivePosition: 'Strong',
  ...overrides,
});

describe('MarginOfSafetyCalculator quality refreshes', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );
  });

  const renderCalculator = async () => {
    await act(async () => {
      root.render(React.createElement(MarginOfSafetyCalculator));
      await Promise.resolve();
    });
  };

  afterEach(() => {
    root?.unmount();
    container?.remove();
    localStorage.clear();
    mocks.currentStockData = undefined;
    mocks.toast.mockReset();
    mocks.fetchStockData.mockReset();
    vi.unstubAllGlobals();
  });

  it('updates refreshed quality without overwriting a chosen buffer, then defaults a new symbol', async () => {
    localStorage.clear();
    mocks.currentStockData = makeStock('ACME');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await renderCalculator();

    expect(container.querySelector('[data-testid="mock-quality"]')?.textContent).toBe(
      'Exceptional|15-25%',
    );
    expect(container.querySelector('[data-testid="mock-margin-value"]')?.textContent).toBe(
      '20%',
    );

    await act(async () => {
      container
        .querySelector('[data-testid="mock-margin-of-safety"] button')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="mock-margin-value"]')?.textContent).toBe(
      '50%',
    );

    mocks.currentStockData = makeStock('ACME', { debtToEquity: 3 });
    await renderCalculator();

    expect(container.querySelector('[data-testid="mock-quality"]')?.textContent).toBe(
      'Caution|40-50%+',
    );
    expect(container.querySelector('[data-testid="mock-margin-value"]')?.textContent).toBe(
      '50%',
    );
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Quality reassessed: Caution',
        description: expect.stringContaining(
          'Exceptional → Caution. The recommended margin of safety is now 40-50%',
        ),
      }),
    );

    mocks.currentStockData = makeStock('BETA', {
      roe: 20,
      debtToEquity: 0.4,
      currentRatio: 1.5,
      revenueGrowth: 10,
      earningsStability: 'Medium',
      competitivePosition: 'Good',
    });
    await renderCalculator();

    expect(container.querySelector('[data-testid="mock-quality"]')?.textContent).toBe(
      'Good|25-35%',
    );
    expect(container.querySelector('[data-testid="mock-margin-value"]')?.textContent).toBe(
      '30%',
    );
  });
});