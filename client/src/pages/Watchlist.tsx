import React from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, RefreshCw, Trash2, BookmarkPlus, Loader2 } from 'lucide-react';
import { StockData, WatchlistEntry } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { classifyBuyZone, priceVsBuyBelowPct, describeFreshness, type BuyZone } from '@/lib/watchlist';
import {
  calculateDCFDetailed,
  calculatePEDetailed,
  calculateGrahamDetailed,
  calculateBuyBelow,
  calculateAverageValuation,
} from '@/lib/calculators';
import type { ValuationParams, ValuationResult } from '@/lib/types';

// Default valuation params used to compute intrinsic value for each watchlist
// row. These mirror the calculator's defaults so the watchlist's "buy-below"
// matches what the user would see if they opened the ticker on the home page
// without changing any knobs.
const DEFAULT_VALUATION_PARAMS: ValuationParams = {
  dcfGrowthRate: 10,
  dcfDiscountRate: 12,
  dcfTerminalMultiple: 15,
  dcfForecastPeriod: 5,
  peType: 'current',
  peCustomValue: 15,
  peAdjustment: 100,
  grahamGrowthRate: 11.8,
  grahamBaseValue: 8.5,
};

// Compute the average buy-below threshold across DCF / P/E / Graham, applying
// the user's saved MoS. Returns null when stock data isn't valid for valuation.
function computeAverageBuyBelow(stock: StockData, marginOfSafety: number): number | null {
  if (!stock || stock.error || !Number.isFinite(stock.price) || stock.price <= 0) return null;
  const dcf = calculateDCFDetailed(stock, DEFAULT_VALUATION_PARAMS);
  const pe = calculatePEDetailed(stock, DEFAULT_VALUATION_PARAMS);
  const graham = calculateGrahamDetailed(stock, DEFAULT_VALUATION_PARAMS);
  const results: ValuationResult[] = [
    { method: 'DCF Analysis', intrinsicValue: dcf.value, buyBelow: calculateBuyBelow(dcf.value, marginOfSafety), discountPremium: 0 },
    { method: 'P/E Based', intrinsicValue: pe.value, buyBelow: calculateBuyBelow(pe.value, marginOfSafety), discountPremium: 0 },
    { method: 'Graham Formula', intrinsicValue: graham.value, buyBelow: calculateBuyBelow(graham.value, marginOfSafety), discountPremium: 0 },
  ];
  const avg = calculateAverageValuation(results, stock.price);
  return Number.isFinite(avg.buyBelow) && avg.buyBelow > 0 ? avg.buyBelow : null;
}

// Tone classes per buy-zone — keeps the JSX in WatchlistRow tidy.
const ZONE_STYLES: Record<BuyZone, { row: string; pill: string; label: string }> = {
  buy: {
    row: 'bg-emerald-50 border-emerald-200',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    label: 'In buy zone',
  },
  near: {
    row: 'bg-amber-50 border-amber-200',
    pill: 'bg-amber-100 text-amber-800 border-amber-300',
    label: 'Near buy zone',
  },
  neutral: {
    row: 'bg-white border-neutral-200',
    pill: 'bg-neutral-100 text-neutral-700 border-neutral-300',
    label: 'Above buy-below',
  },
};

interface WatchlistRowProps {
  entry: WatchlistEntry;
  onRemove: (id: number) => void;
  isRemoving: boolean;
}

const WatchlistRow: React.FC<WatchlistRowProps> = ({ entry, onRemove, isRemoving }) => {
  const stockQuery = useQuery<StockData>({
    queryKey: ['/api/stock', entry.symbol],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/stock/${entry.symbol}`, undefined);
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });

  const stock = stockQuery.data;
  const buyBelow = stock && !stock.error ? computeAverageBuyBelow(stock, entry.marginOfSafety) : null;
  const zone: BuyZone = stock && !stock.error && buyBelow !== null
    ? classifyBuyZone(stock.price, buyBelow)
    : 'neutral';
  const headroom = stock && !stock.error && buyBelow !== null
    ? priceVsBuyBelowPct(stock.price, buyBelow)
    : null;
  const styles = ZONE_STYLES[zone];

  return (
    <div
      data-testid={`watchlist-row-${entry.symbol}`}
      className={`rounded-md border p-4 ${styles.row}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-lg font-semibold text-[#1A2942]">{entry.symbol}</span>
            {stock && !stock.error && (
              <span className="text-sm text-neutral-600 truncate">{stock.name}</span>
            )}
            <span
              className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${styles.pill}`}
              data-testid={`watchlist-zone-${entry.symbol}`}
            >
              {styles.label}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-sm">
            <div>
              <div className="text-xs text-neutral-500">Price</div>
              <div className="font-medium text-neutral-900">
                {stockQuery.isLoading ? '…' :
                  stock && !stock.error ? formatCurrency(stock.price) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Buy below</div>
              <div className="font-medium text-neutral-900">
                {buyBelow !== null ? formatCurrency(buyBelow) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">MoS</div>
              <div className="font-medium text-neutral-900">{entry.marginOfSafety}%</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Vs. threshold</div>
              <div className="font-medium text-neutral-900">
                {headroom === null ? '—'
                  : headroom <= 0 ? `${Math.abs(headroom).toFixed(1)}% below`
                  : `${headroom.toFixed(1)}% above`}
              </div>
            </div>
          </div>
          {stock?.fetchedAt && (
            <div className="mt-1 text-[11px] text-neutral-500">
              Last refreshed {describeFreshness(stock.fetchedAt)}
              {stock.dataSource ? ` · source: ${stock.dataSource}` : ''}
            </div>
          )}
          {stock?.error && (
            <div className="mt-1 text-xs text-red-600">
              {stock.errorMessage || 'Could not load latest price.'}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/"
            className="text-xs px-2 py-1 rounded border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
          >
            Open in calculator
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid={`button-remove-${entry.symbol}`}
            disabled={isRemoving}
            onClick={() => onRemove(entry.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
            aria-label={`Remove ${entry.symbol} from watchlist`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const Watchlist: React.FC = () => {
  const { toast } = useToast();
  const watchlistQuery = useQuery<WatchlistEntry[]>({ queryKey: ['/api/watchlist'] });
  const entries = watchlistQuery.data ?? [];

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/watchlist/${id}`, undefined);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Could not remove entry',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const handleRefresh = () => {
    // Invalidate the list itself plus every per-row stock query so the page
    // pulls fresh prices through the existing tiered data pipeline.
    queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    queryClient.invalidateQueries({ queryKey: ['/api/stock'] });
    toast({ title: 'Refreshing watchlist…', description: 'Fetching latest prices.' });
  };

  // Counts for the header summary — gives users a glanceable sense of where
  // their list stands ("3 in buy zone, 2 near, 5 above").
  const cachedZones = entries.map((entry) => {
    const stock = queryClient.getQueryData<StockData>(['/api/stock', entry.symbol]);
    if (!stock || stock.error) return 'neutral' as BuyZone;
    const bb = computeAverageBuyBelow(stock, entry.marginOfSafety);
    if (bb === null) return 'neutral' as BuyZone;
    return classifyBuyZone(stock.price, bb);
  });
  const buyCount = cachedZones.filter((z) => z === 'buy').length;
  const nearCount = cachedZones.filter((z) => z === 'near').length;

  return (
    <main className="min-h-screen bg-neutral-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <Link href="/" className="text-sm text-neutral-600 hover:text-neutral-900 inline-flex items-center mb-2">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to calculator
            </Link>
            <h1 className="text-2xl font-bold text-[#1A2942]">Watchlist</h1>
            <p className="text-sm text-neutral-600">
              Tickers you're tracking. Rows turn green when price crosses your buy-below threshold.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleRefresh}
            data-testid="button-refresh-watchlist"
            disabled={watchlistQuery.isLoading}
            className="h-9"
          >
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>

        {entries.length > 0 && (
          <div className="mb-4 text-xs text-neutral-600 flex flex-wrap gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800">
              {buyCount} in buy zone
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
              {nearCount} near
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-neutral-200 bg-neutral-50 text-neutral-700">
              {entries.length} total
            </span>
          </div>
        )}

        {watchlistQuery.isLoading ? (
          <div className="flex items-center justify-center py-16 text-neutral-500">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading watchlist…
          </div>
        ) : watchlistQuery.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
            Couldn't load your watchlist. Please refresh the page.
          </div>
        ) : entries.length === 0 ? (
          <div
            data-testid="watchlist-empty"
            className="rounded-md border border-dashed border-neutral-300 bg-white p-8 text-center"
          >
            <BookmarkPlus className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
            <h2 className="text-lg font-semibold text-neutral-800">No tickers yet</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Look up a stock on the calculator and click <strong>+ Add to Watchlist</strong> to start tracking buy-below alerts.
            </p>
            <div className="mt-4">
              <Link
                href="/"
                className="inline-block text-sm px-3 py-1.5 rounded bg-[#21324F] text-white hover:bg-[#1A2942]"
              >
                Go to calculator
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <WatchlistRow
                key={entry.id}
                entry={entry}
                onRemove={(id) => removeMutation.mutate(id)}
                isRemoving={removeMutation.isPending && removeMutation.variables === entry.id}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

export default Watchlist;
