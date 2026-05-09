import React, { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, RefreshCw, Trash2, BookmarkPlus, Loader2, TrendingUp } from 'lucide-react';
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
import { scoreTicker, compositeBand } from '@/lib/multibaggerScreener';

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

// Tone classes per buy-zone — applied to the table row plus the inline pill.
const ZONE_STYLES: Record<BuyZone, { row: string; pill: string; label: string }> = {
  buy: {
    row: 'bg-emerald-50 hover:bg-emerald-100/70',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    label: 'In buy zone',
  },
  near: {
    row: 'bg-amber-50 hover:bg-amber-100/70',
    pill: 'bg-amber-100 text-amber-800 border-amber-300',
    label: 'Near buy zone',
  },
  neutral: {
    row: '',
    pill: 'bg-neutral-100 text-neutral-700 border-neutral-300',
    label: 'Above buy-below',
  },
};

interface WatchlistRowProps {
  entry: WatchlistEntry;
  onRemove: (id: number) => void;
  isRemoving: boolean;
}

// Score-tone styling for the per-row composite chip — mirrors the screener panel.
const SCORE_TONE: Record<'positive' | 'neutral' | 'negative' | 'muted', string> = {
  positive: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  neutral: 'bg-amber-100 text-amber-800 border-amber-300',
  negative: 'bg-rose-100 text-rose-800 border-rose-300',
  muted: 'bg-neutral-100 text-neutral-600 border-neutral-300',
};

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
  const stockOk = !!stock && !stock.error;
  const buyBelow = stockOk ? computeAverageBuyBelow(stock, entry.marginOfSafety) : null;
  const zone: BuyZone = stockOk && buyBelow !== null
    ? classifyBuyZone(stock.price, buyBelow)
    : 'neutral';
  const headroom = stockOk && buyBelow !== null
    ? priceVsBuyBelowPct(stock.price, buyBelow)
    : null;
  const styles = ZONE_STYLES[zone];

  // Multibagger composite (Task #33). Computed inline from the same cached
  // stock payload so we don't double-fetch. Renders as a chip in its own
  // column; sorting is handled at the parent.
  const score = stockOk ? scoreTicker(stock).composite : null;
  const scoreBand = compositeBand(score);

  return (
    <TableRow
      data-testid={`watchlist-row-${entry.symbol}`}
      className={styles.row}
    >
      <TableCell className="font-semibold text-[#1A2942]">
        <div className="flex flex-col">
          <span>{entry.symbol}</span>
          {stock?.fetchedAt && (
            <span className="text-[10px] font-normal text-neutral-400">
              {describeFreshness(stock.fetchedAt)}
              {stock.dataSource ? ` · ${stock.dataSource}` : ''}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-neutral-700">
        {stockQuery.isLoading ? (
          <span className="text-neutral-400">…</span>
        ) : stockOk ? (
          <span className="block truncate max-w-[220px]" title={stock.name}>{stock.name}</span>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {stockQuery.isLoading ? (
          <span className="text-neutral-400">…</span>
        ) : stockOk ? (
          formatCurrency(stock.price)
        ) : (
          <span className="text-red-600 text-xs" title={stock?.errorMessage}>error</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {buyBelow !== null ? formatCurrency(buyBelow) : <span className="text-neutral-400">—</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{entry.marginOfSafety}%</TableCell>
      <TableCell className="text-right tabular-nums text-sm text-neutral-700">
        {headroom === null ? (
          <span className="text-neutral-400">—</span>
        ) : headroom <= 0 ? (
          `${Math.abs(headroom).toFixed(1)}% below`
        ) : (
          `${headroom.toFixed(1)}% above`
        )}
      </TableCell>
      <TableCell>
        <span
          className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${styles.pill}`}
          data-testid={`watchlist-zone-${entry.symbol}`}
        >
          {styles.label}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <span
          className={`inline-flex items-center text-xs tabular-nums px-2 py-0.5 rounded-full border ${SCORE_TONE[scoreBand.tone]}`}
          data-testid={`watchlist-score-${entry.symbol}`}
          title={`${scoreBand.label} multibagger factor exposure (Yartseva 2025)`}
        >
          {score === null ? '—' : score.toFixed(0)}
        </span>
      </TableCell>
      <TableCell className="text-right">
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
      </TableCell>
    </TableRow>
  );
};

// Look up cached stock data and compute the multibagger composite for a single
// entry. Returns `null` when the row hasn't been fetched yet, or when the
// scorer can't compute a composite. Pulled out of the component so the parent
// can sort using the same helper its child rows render with.
function lookupComposite(symbol: string): number | null {
  const stock = queryClient.getQueryData<StockData>(['/api/stock', symbol]);
  if (!stock || stock.error) return null;
  return scoreTicker(stock).composite;
}

const Watchlist: React.FC = () => {
  const { toast } = useToast();
  const watchlistQuery = useQuery<WatchlistEntry[]>({ queryKey: ['/api/watchlist'] });
  const rawEntries = watchlistQuery.data ?? [];

  // Sort toggle (Task #33). Default order is server-provided (insertion); the
  // user can flip into "by multibagger composite, descending" with one click.
  // Entries whose score hasn't computed yet sort last so the user sees the
  // ranked head of the list immediately and the unfetched tail can fill in
  // as the per-row queries resolve.
  const [sortByScore, setSortByScore] = useState(false);
  const entries = sortByScore
    ? [...rawEntries].sort((a, b) => {
        const sa = lookupComposite(a.symbol);
        const sb = lookupComposite(b.symbol);
        if (sa === null && sb === null) return 0;
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sb - sa;
      })
    : rawEntries;

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
          <div className="flex gap-2">
            <Button
              type="button"
              variant={sortByScore ? 'default' : 'outline'}
              onClick={() => setSortByScore((s) => !s)}
              data-testid="button-sort-by-score"
              disabled={entries.length === 0}
              className="h-9"
              title="Sort the list by Multibagger composite score (Yartseva 2025)"
            >
              <TrendingUp className="w-4 h-4 mr-1" />
              {sortByScore ? 'Sorted by score' : 'Sort by score'}
            </Button>
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
          <div className="bg-white rounded-md border border-neutral-200 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Symbol</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Buy Below</TableHead>
                  <TableHead className="text-right">MoS</TableHead>
                  <TableHead className="text-right">Vs. Threshold</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead className="text-right w-[80px]" title="Multibagger composite (Yartseva 2025)">
                    Score
                  </TableHead>
                  <TableHead className="text-right w-[60px]">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <WatchlistRow
                    key={entry.id}
                    entry={entry}
                    onRemove={(id) => removeMutation.mutate(id)}
                    isRemoving={removeMutation.isPending && removeMutation.variables === entry.id}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </main>
  );
};

export default Watchlist;
