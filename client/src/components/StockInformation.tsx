import React, { useState, useRef, useEffect } from 'react';
import { StyledInput } from '@/components/ui/styled-input';
import { Button } from '@/components/ui/button';
import { StockData } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Search, RefreshCcw, Database, Clock, AlertTriangle, AlertOctagon, BookmarkPlus, Check } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

// Map upstream IDs to short, user-friendly labels for the divergence popover.
const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  yfinance: 'Yahoo Finance',
  rapidapi: 'RapidAPI',
  alphavantage: 'Alpha Vantage',
  scraper: 'web scrape',
  fallback: 'static fallback',
  unknown: 'unknown',
};

// Map raw schema field names to plain-English labels for the popover.
const FIELD_DISPLAY_NAMES: Record<string, string> = {
  price: 'Price',
  eps: 'EPS',
  peRatio: 'P/E ratio',
  fcfPerShare: 'FCF / share',
  growthRate: 'Growth rate',
};

function formatFieldValue(field: string, value: number): string {
  if (field === 'price' || field === 'eps' || field === 'fcfPerShare') {
    return formatCurrency(value);
  }
  if (field === 'peRatio') return value.toFixed(2);
  if (field === 'growthRate') return `${value.toFixed(2)}%`;
  return String(value);
}

// Map upstream source IDs to short, user-friendly labels for the badge.
const SOURCE_LABELS: Record<string, { label: string; tone: 'fresh' | 'ok' | 'warn' }> = {
  yfinance: { label: 'Yahoo Finance', tone: 'fresh' },
  rapidapi: { label: 'RapidAPI', tone: 'ok' },
  'alphavantage': { label: 'Alpha Vantage', tone: 'ok' },
  'scraper': { label: 'web scrape', tone: 'warn' },
  fallback: { label: 'static fallback', tone: 'warn' },
  unknown: { label: 'unknown', tone: 'warn' },
};

function describeFreshness(iso?: string): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const ageMs = Date.now() - ts;
  if (ageMs < 60_000) return 'just now';
  const minutes = Math.round(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

interface StockInformationProps {
  stockData: StockData | undefined;
  isLoading: boolean;
  onFetchData: (symbol: string) => void;
  error?: boolean;
  errorMessage?: string;
  // Current MoS % the user has dialled in. Used by the "Add to Watchlist"
  // button so the saved entry reflects what the user is actually looking at.
  // Optional (defaults to 25) so older callers don't break.
  marginOfSafety?: number;
}

// Popular stocks for prefetching
const POPULAR_STOCKS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];

const StockInformation: React.FC<StockInformationProps> = ({ 
  stockData,
  isLoading, 
  onFetchData,
  error,
  errorMessage,
  marginOfSafety = 25,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isCached, setIsCached] = useState(false);
  const [justAddedSymbol, setJustAddedSymbol] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Watchlist add — isolated from the provenance/divergence badge block on
  // purpose so this commit doesn't tangle with the parallel cross-source and
  // historical-P/E tasks that own that area.
  const addToWatchlist = useMutation({
    mutationFn: async (payload: { symbol: string; marginOfSafety: number }) => {
      const res = await apiRequest('POST', '/api/watchlist', payload);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      setJustAddedSymbol(variables.symbol);
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({
        title: 'Added to watchlist',
        description: `${variables.symbol} will alert when price ≤ buy-below (MoS ${variables.marginOfSafety}%).`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Could not add to watchlist',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Reset the "Added" confirmation when the user loads a different ticker.
  useEffect(() => {
    if (stockData?.symbol && stockData.symbol !== justAddedSymbol) {
      setJustAddedSymbol(null);
    }
  }, [stockData?.symbol, justAddedSymbol]);

  // Prefetch popular stock data when component loads
  useEffect(() => {
    // Prefetch popular stocks data in the background for common symbols
    POPULAR_STOCKS.forEach((symbol) => {
      queryClient.prefetchQuery({
        queryKey: ['/api/stock', symbol],
        queryFn: async () => {
          const res = await fetch(`/api/stock/${symbol}`);
          if (!res.ok) throw new Error('Network response was not ok');
          return res.json();
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
    });
  }, [queryClient]);

  // Check if the stock data is cached
  useEffect(() => {
    if (inputValue) {
      const cachedData = queryClient.getQueryData(['/api/stock', inputValue]);
      setIsCached(!!cachedData);
    } else {
      setIsCached(false);
    }
  }, [inputValue, queryClient]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setInputValue(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (inputValue) {
        onFetchData(inputValue);
      }
    }
  };

  const handleFetchData = () => {
    if (inputValue) {
      onFetchData(inputValue);
    }
  };
  
  // Force a fresh data fetch, bypassing cache
  const handleRefreshData = () => {
    if (stockData && stockData.symbol) {
      // Invalidate the current data to force a fresh fetch
      queryClient.invalidateQueries({ queryKey: ['/api/stock', stockData.symbol] });
      queryClient.invalidateQueries({ queryKey: [`/api/stock/${stockData.symbol}/history`] });
      onFetchData(stockData.symbol);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-neutral-200">
      <h2 className="text-xl font-semibold text-[#1A2942] mb-4">Stock Information</h2>
      
      {/* Stock Symbol Input */}
      <div>
        <label htmlFor="stockSymbol" className="block text-sm font-medium text-neutral-700 mb-2">Stock Symbol</label>
        <div className="relative flex">
          <div className="relative flex-grow">
            <StyledInput
              ref={inputRef}
              id="stockSymbol"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="pr-4 w-full"
              placeholder="e.g. AAPL"
            />

          </div>
          <Button
            onClick={handleFetchData}
            disabled={isLoading}
            className="ml-2 bg-[#21324F] hover:bg-[#1A2942] text-white font-medium"
          >
            {isLoading ? (
              <span className="flex items-center">Loading...</span>
            ) : (
              <span className="flex items-center">
                <Search className="w-4 h-4 mr-1" /> Find
              </span>
            )}
          </Button>
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          Enter US ticker (AAPL) or international: BP.L, 7203.T, 0700.HK.
        </p>
        
        {/* Error Message */}
        {(error || (stockData && stockData.error)) && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">
              {errorMessage || (stockData && stockData.errorMessage) || "Could not find the stock. Please check your input and try again."}
            </p>
            <div className="text-xs text-neutral-600 mt-1">
              <strong>Tips:</strong> 
              <ul className="list-disc pl-5 mt-1">
                <li>Try using the exact ticker symbol (e.g., 'AAPL' for Apple)</li>
                <li>For European stocks, add the exchange suffix (e.g., 'BP.L' for BP on London Exchange)</li>
                <li>For Japanese stocks, add '.T' suffix (e.g., '7203.T' for Toyota, '9984.T' for SoftBank)</li>
                <li>For Hong Kong stocks, add '.HK' suffix (e.g., '0700.HK' for Tencent, '9988.HK' for Alibaba)</li>
              </ul>
            </div>
          </div>
        )}
        
        {/* Stock Details Info */}
        {stockData && !stockData.error && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">
              Successfully found stock: <strong>{stockData.name} ({stockData.symbol})</strong>
            </p>
            <p className="text-xs text-neutral-600 mt-1">
              Current Price: <strong>{formatCurrency(stockData.price)}</strong>
            </p>
            {/* FCF yield top-line (Task #30 — Yartseva 2025 multibagger
                empirics, primary cash-quality gate). Prefer the upstream
                computation, fall back to fcfPerShare/price so we always
                surface a number when one is computable. */}
            {(() => {
              const upstream = stockData.multibaggerSignals?.fcfYield;
              const fallback =
                stockData.price > 0 && Number.isFinite(stockData.fcfPerShare)
                  ? (stockData.fcfPerShare / stockData.price) * 100
                  : null;
              const fcfYieldPct =
                upstream != null && Number.isFinite(upstream) ? upstream : fallback;
              if (fcfYieldPct === null) return null;
              const tone =
                fcfYieldPct > 5
                  ? 'text-emerald-700'
                  : fcfYieldPct <= 0
                  ? 'text-rose-700'
                  : 'text-amber-700';
              return (
                <p
                  className="text-xs text-neutral-600 mt-1"
                  data-testid="stock-info-fcf-yield"
                >
                  FCF yield:{' '}
                  <strong className={tone}>{fcfYieldPct.toFixed(1)}%</strong>
                </p>
              );
            })()}

            {/* Data provenance — shows which upstream API the numbers came
                from and how stale they are, so investors can judge the
                trustworthiness of the valuation that follows. */}
            {(stockData.dataSource || stockData.fetchedAt) && (() => {
              const meta = stockData.dataSource ? SOURCE_LABELS[stockData.dataSource] : undefined;
              const tone = meta?.tone ?? 'warn';
              const toneClasses =
                tone === 'fresh'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : tone === 'ok'
                  ? 'bg-sky-100 text-sky-800 border-sky-200'
                  : 'bg-amber-100 text-amber-800 border-amber-200';
              return (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border ${toneClasses}`}>
                    <Database className="w-3 h-3 mr-1" />
                    Source: {meta?.label ?? stockData.dataSource ?? 'unknown'}
                  </span>
                  {stockData.fetchedAt && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded border border-neutral-200 bg-neutral-50 text-neutral-700">
                      <Clock className="w-3 h-3 mr-1" />
                      Fetched {describeFreshness(stockData.fetchedAt)}
                    </span>
                  )}
                  {stockData.appliedAdjustments && stockData.appliedAdjustments.length > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800"
                      title={stockData.appliedAdjustments.join('\n')}>
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {stockData.appliedAdjustments.length} adjustment{stockData.appliedAdjustments.length === 1 ? '' : 's'}
                    </span>
                  )}
                  {stockData.crossSourceDivergence && stockData.crossSourceDivergence.fields.length > 0 && (() => {
                    const div = stockData.crossSourceDivergence;
                    const aLabel = SOURCE_DISPLAY_NAMES[div.sourceA] ?? div.sourceA;
                    const bLabel = SOURCE_DISPLAY_NAMES[div.sourceB] ?? div.sourceB;
                    return (
                      <HoverCard openDelay={120}>
                        <HoverCardTrigger asChild>
                          <button
                            type="button"
                            data-testid="badge-sources-disagree"
                            className="inline-flex items-center px-2 py-0.5 rounded border border-yellow-300 bg-yellow-100 text-yellow-900 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-help"
                          >
                            <AlertOctagon className="w-3 h-3 mr-1" />
                            Sources disagree
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-80" align="start">
                          <div className="space-y-2 text-xs">
                            <p className="font-semibold text-neutral-800">
                              {aLabel} vs. {bLabel} disagree on {div.fields.length} metric{div.fields.length === 1 ? '' : 's'}
                            </p>
                            <p className="text-neutral-600">
                              These two providers returned numbers more than 15% apart. The headline figures above use the primary source — treat them with extra care.
                            </p>
                            <div className="border-t border-neutral-200 pt-2 space-y-1.5">
                              {div.fields.map((f) => (
                                <div key={f.field} className="flex flex-col">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-neutral-800">
                                      {FIELD_DISPLAY_NAMES[f.field] ?? f.field}
                                    </span>
                                    <span className="text-yellow-800 font-semibold">
                                      Δ {f.deltaPct.toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-neutral-600">
                                    <span>{aLabel}: <strong>{formatFieldValue(f.field, f.valueA)}</strong></span>
                                    <span>{bLabel}: <strong>{formatFieldValue(f.field, f.valueB)}</strong></span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <p className="text-[10px] text-neutral-500 pt-1">
                              Last checked {describeFreshness(div.checkedAt)}
                            </p>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Watchlist add — separate sibling from the provenance badge row
                above to keep merges with the cross-source / historical-P/E
                tasks mechanical. */}
            <div className="mt-3 flex">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="button-add-to-watchlist"
                disabled={addToWatchlist.isPending || justAddedSymbol === stockData.symbol}
                onClick={() => addToWatchlist.mutate({
                  symbol: stockData.symbol,
                  marginOfSafety: Math.round(marginOfSafety),
                })}
                className="text-xs h-7 px-2 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
              >
                {justAddedSymbol === stockData.symbol ? (
                  <span className="flex items-center"><Check className="w-3 h-3 mr-1" /> Added</span>
                ) : (
                  <span className="flex items-center"><BookmarkPlus className="w-3 h-3 mr-1" /> Add to Watchlist</span>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockInformation;