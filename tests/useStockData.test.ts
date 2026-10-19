// @vitest-environment happy-dom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockData } from '../client/src/lib/types';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../client/src/lib/queryClient', () => ({
  apiRequest: mocks.apiRequest,
}));

vi.mock('../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

import { useStockData } from '../client/src/hooks/useStockData';

const failedLookup: StockData = {
  symbol: 'MKC',
  name: 'MKC',
  price: 0,
  eps: 0,
  peRatio: 0,
  fcfPerShare: 0,
  growthRate: 0,
  roe: 0,
  debtToEquity: 0,
  currentRatio: 0,
  revenueGrowth: 0,
  earningsStability: 'Low',
  competitivePosition: 'Average',
  error: true,
  errorMessage: 'Market data for "MKC" is temporarily unavailable. Please try again shortly.',
};

const successfulLookup: StockData = {
  ...failedLookup,
  name: 'McCormick & Company',
  price: 46.35,
  eps: 5.53,
  peRatio: 8.38,
  fcfPerShare: 2.915,
  error: false,
  errorMessage: undefined,
};

describe('useStockData provider failures', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;
  let current: ReturnType<typeof useStockData> | undefined;

  function Harness() {
    current = useStockData();
    return null;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    current = undefined;
  });

  afterEach(() => {
    root.unmount();
    queryClient.clear();
    container.remove();
  });

  it('shows a recoverable temporary-data error, retries the same symbol, then exposes only complete data', async () => {
    mocks.apiRequest
      .mockResolvedValueOnce({ json: async () => failedLookup })
      .mockResolvedValueOnce({ json: async () => successfulLookup });

    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(Harness),
        ),
      );
    });

    await act(async () => {
      current!.fetchStockData('mkc');
      await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    });

    expect(mocks.toast.mock.calls[0][0].title).toBe('Market data temporarily unavailable');
    expect(mocks.toast.mock.calls[0][0].description).toContain('temporarily unavailable');
    expect(mocks.toast.mock.calls[0][0].description).not.toContain('ticker symbol is correct');
    expect(current!.stockData).toBeUndefined();

    const retryAction = mocks.toast.mock.calls[0][0].action as React.ReactElement<{
      onClick?: () => void;
    }>;
    expect(retryAction.props.children).toBe('Retry');

    await act(async () => {
      retryAction.props.onClick?.();
      await vi.waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(2));
    });

    await act(async () => {
      await vi.waitFor(() => expect(current!.stockData?.price).toBe(46.35));
    });
    expect(mocks.apiRequest).toHaveBeenNthCalledWith(2, 'GET', '/api/stock/MKC', undefined);
    expect(current!.stockData?.error).not.toBe(true);
    expect(current!.stockData?.eps).toBe(5.53);
  });

  it('rejects a success-shaped response without valuation inputs', async () => {
    mocks.apiRequest.mockResolvedValueOnce({
      json: async () => ({ ...failedLookup, error: false, errorMessage: undefined }),
    });

    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(Harness),
        ),
      );
    });

    await act(async () => {
      current!.fetchStockData('MKC');
      await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
    });

    expect(mocks.toast.mock.calls[0][0].title).toBe('Market data temporarily unavailable');
    expect(current!.stockData).toBeUndefined();
    expect(queryClient.getQueryData(['/api/stock', 'MKC'])).toBeUndefined();
  });
});
