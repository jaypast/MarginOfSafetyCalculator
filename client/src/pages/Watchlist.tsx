import React, { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useQueries, useMutation } from '@tanstack/react-query';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLocation } from 'wouter';
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
  stock: StockData | undefined;
  isLoading: boolean;
  onRemove: (id: number) => void;
  isRemoving: boolean;
  onOpen: (symbol: string) => void;
}

// Score-tone styling for the per-row composite chip — mirrors the screener panel.
const SCORE_TONE: Record<'positive' | 'neutral' | 'negative' | 'muted', string> = {
  positive: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  neutral: 'bg-amber-100 text-amber-800 border-amber-300',
  negative: 'bg-rose-100 text-rose-800 border-rose-300',
  muted: 'bg-neutral-100 text-neutral-600 border-neutral-300',
};

const WatchlistRow: React.FC<WatchlistRowProps> = ({ entry, stock, isLoading, onRemove, isRemoving, onOpen }) => {
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
  // column; sorting is handled at the parent. When fewer than 4 of the 5
  // factors computed, the chip carries a low-confidence warning marker.
  const scoreResult = stockOk ? scoreTicker(stock!) : null;
  const score = scoreResult?.composite ?? null;
  const scoreLowConfidence = scoreResult?.lowConfidence ?? false;
  const scoreBand = compositeBand(score);

  return (
    <TableRow
      data-testid={`watchlist-row-${entry.symbol}`}
      className={`${styles.row} cursor-pointer`}
      onClick={() => onOpen(entry.symbol)}
      title={`Open full analysis for ${entry.symbol}`}
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
        {isLoading ? (
          <span className="text-neutral-400">…</span>
        ) : stockOk ? (
          <span className="block truncate max-w-[220px]" title={stock!.name}>{stock!.name}</span>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {isLoading ? (
          <span className="text-neutral-400">…</span>
        ) : stockOk ? (
          formatCurrency(stock!.price)
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
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`inline-flex items-center gap-1 text-xs tabular-nums px-2 py-0.5 rounded-full border cursor-help ${scoreLowConfidence ? SCORE_TONE.muted : SCORE_TONE[scoreBand.tone]}`}
                data-testid={`watchlist-score-${entry.symbol}`}
              >
                {scoreLowConfidence && <span aria-hidden="true">⚠</span>}
                {score === null ? '—' : score.toFixed(0)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px] text-xs">
              {scoreLowConfidence
                ? `Low-confidence score — only ${scoreResult!.computedFactors} of ${scoreResult!.subScores.length} multibagger factors could be computed (need 4+). Use as a rough signal, not a precise rank.`
                : `${scoreBand.label} multibagger factor exposure (Yartseva 2025 empirics)`}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid={`button-remove-${entry.symbol}`}
          disabled={isRemoving}
          onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
          aria-label={`Remove ${entry.symbol} from watchlist`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
};

// Sort entries by composite score (descending) in three tiers: reliable
// scores first, then low-confidence scores (< 4 of 5 factors computed —
// flagged, so they must not outrank reliable ones at face value), then
// null/missing scores at the tail. Pure function so the watchlist sort path
// is trivially testable without rendering React.
export interface SortableScore {
  composite: number | null;
  lowConfidence: boolean;
}

export function sortEntriesByScore<T extends { symbol: string }>(
  entries: readonly T[],
  scoreFor: (symbol: string) => SortableScore | null,
): T[] {
  const tierOf = (s: SortableScore | null): number => {
    if (!s || s.composite === null) return 2;
    return s.lowConfidence ? 1 : 0;
  };
  return [...entries].sort((a, b) => {
    const sa = scoreFor(a.symbol);
    const sb = scoreFor(b.symbol);
    const ta = tierOf(sa);
    const tb = tierOf(sb);
    if (ta !== tb) return ta - tb;
    if (ta === 2) return 0;
    return sb!.composite! - sa!.composite!;
  });
}

const Watchlist: React.FC = () => {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const handleOpen = (symbol: string) => navigate(`/?symbol=${encodeURIComponent(symbol)}`);
  const watchlistQuery = useQuery<WatchlistEntry[]>({ queryKey: ['/api/watchlist'] });
  const rawEntries = watchlistQuery.data ?? [];

  // Drive every per-symbol fetch from the parent so the parent re-renders
  // (and re-sorts) as scores resolve. Children receive the data + loading
  // flag as props instead of running their own useQuery — a single source
  // of truth keeps the "Sort by score" toggle reactive.
  const stockResults = useQueries({
    queries: rawEntries.map((entry) => ({
      queryKey: ['/api/stock', entry.symbol] as const,
      queryFn: async (): Promise<StockData> => {
        const res = await apiRequest('GET', `/api/stock/${entry.symbol}`, undefined);
        return res.json();
      },
      staleTime: 2 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      retry: 1,
    })),
  });

  // Symbol → { stock, isLoading } lookup, recomputed every render so it
  // stays in sync with whatever useQueries last returned.
  const stockBySymbol = useMemo(() => {
    const map = new Map<string, { stock: StockData | undefined; isLoading: boolean }>();
    rawEntries.forEach((entry, i) => {
      const r = stockResults[i];
      map.set(entry.symbol, { stock: r?.data, isLoading: !!r?.isLoading });
    });
    return map;
  }, [rawEntries, stockResults]);

  // Composite-score lookup used by the sort path. Reads from the live
  // useQueries results above, NOT the React Query cache directly, so the
  // parent re-renders and re-sorts as new rows resolve. Returns the full
  // score result so low-confidence entries can be demoted below reliable ones.
  const scoreFor = (symbol: string): SortableScore | null => {
    const entry = stockBySymbol.get(symbol);
    if (!entry || !entry.stock || entry.stock.error) return null;
    return scoreTicker(entry.stock);
  };

  // Sort toggle (Task #33). Default order is server-provided (insertion);
  // user can flip into "by multibagger composite, descending" with one click.
  // Sorting is reactive: as more per-row queries resolve, the parent
  // re-renders and sortEntriesByScore picks up the freshly computed scores.
  const [sortByScore, setSortByScore] = useState(true);
  const entries = sortByScore ? sortEntriesByScore(rawEntries, scoreFor) : rawEntries;

  // Loading hint while at least one row is still resolving and the user has
  // asked to sort by score — makes the deferred ranking visible.
  const scoringPending = sortByScore && stockResults.some((r) => r.isLoading);

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
    const stock = stockBySymbol.get(entry.symbol)?.stock;
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
            {scoringPending && (
              <span
                data-testid="scoring-pending"
                className="inline-flex items-center px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700"
              >
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scoring watchlist…
              </span>
            )}
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
                {entries.map((entry) => {
                  const r = stockBySymbol.get(entry.symbol);
                  return (
                    <WatchlistRow
                      key={entry.id}
                      entry={entry}
                      stock={r?.stock}
                      isLoading={!!r?.isLoading}
                      onRemove={(id) => removeMutation.mutate(id)}
                      isRemoving={removeMutation.isPending && removeMutation.variables === entry.id}
                      onOpen={handleOpen}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Score legend — visible on all devices so users never need to hover
            to understand the ⚠ flag. Shown only when there are entries. */}
        {entries.length > 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            <strong>Score</strong> = multibagger factor exposure (Yartseva 2025) · 0–100 scale ·{' '}
            <span className="font-medium">⚠</span> = fewer than 4 of 5 factors available — treat as directional
          </p>
        )}
      </div>
    </main>
  );
};

export default Watchlist;
