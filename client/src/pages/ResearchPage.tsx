import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResearchStock, getCachedResearchData, saveResearchDataToCache, getCacheExpirationDate, getCacheLastUpdated } from '@/lib/researchCache';
import { computeStockQuality } from '@/lib/researchCalculations';
import EmailReportCard from '@/components/EmailReportCard';

const MIN_DISCOUNT_PCT = 10;
const POLL_INTERVAL_MS = 3000;

interface ScanCandidate {
  symbol: string;
  name: string;
  price: number;
  eps: number;
  peRatio: number;
  fcfPerShare: number;
  growthRate: number;
  roe: number;
  debtToEquity: number;
  currentRatio: number;
  quality: 'Exceptional' | 'Good';
  dataSource: string;
  intrinsicValue: number;
  discountPct: number;
}

interface ScanResponse {
  status: 'idle' | 'scanning' | 'done';
  scanned: number;
  poolSize: number;
  found: number;
  candidates: ScanCandidate[];
  startedAt?: number;
  completedAt?: number;
}

function candidateToResearchStock(c: ScanCandidate): ResearchStock {
  return {
    symbol: c.symbol,
    name: c.name,
    price: c.price,
    intrinsicValue: c.intrinsicValue,
    discount: c.discountPct,
    quality: c.quality,
  };
}

const ResearchPage: React.FC = () => {
  const [scanData, setScanData] = useState<ScanResponse | null>(null);
  const [stocks, setStocks] = useState<ResearchStock[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [cacheExpiration, setCacheExpiration] = useState<string>('');
  const [bootstrapped, setBootstrapped] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchScan = async (refresh = false) => {
    try {
      const url = refresh ? '/api/research/scan?refresh=true' : '/api/research/scan';
      const res = await fetch(url);
      if (!res.ok) return;
      const data: ScanResponse = await res.json();
      setScanData(data);

      if (data.status === 'done' && data.candidates.length > 0) {
        const converted = data.candidates
          .map(candidateToResearchStock)
          .sort((a, b) => b.discount - a.discount)
          .slice(0, 10);
        setStocks(converted);
        saveResearchDataToCache(converted);
        setLastUpdated(getCacheLastUpdated());
        setCacheExpiration(getCacheExpirationDate());
      } else if (data.status === 'done') {
        setStocks([]);
      }
    } catch (err) {
      console.error('Research scan fetch failed:', err);
    }
  };

  useEffect(() => {
    const { data: cached, needsRefresh } = getCachedResearchData();
    if (cached && !needsRefresh) {
      setStocks(cached);
      setLastUpdated(getCacheLastUpdated());
      setCacheExpiration(getCacheExpirationDate());
      setScanData({ status: 'done', scanned: 0, poolSize: 0, found: cached.length, candidates: [] });
    } else {
      fetchScan(false);
    }
    setBootstrapped(true);
  }, []);

  useEffect(() => {
    if (!bootstrapped) return;
    if (scanData?.status === 'scanning') {
      pollTimer.current = setTimeout(() => fetchScan(false), POLL_INTERVAL_MS);
    }
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [scanData, bootstrapped]);

  const handleRefresh = () => {
    setStocks([]);
    setScanData(null);
    fetchScan(true);
  };

  const isLoading = !bootstrapped || scanData === null || scanData.status === 'idle' || scanData.status === 'scanning';

  const getQualityBadgeColor = (quality: string) => {
    switch (quality) {
      case 'Exceptional': return 'bg-green-100 text-green-800';
      case 'Good':        return 'bg-blue-100 text-blue-800';
      case 'Average':     return 'bg-yellow-100 text-yellow-800';
      case 'Speculative': return 'bg-red-100 text-red-800';
      default:            return 'bg-neutral-100 text-neutral-800';
    }
  };

  const progressLabel = () => {
    if (!scanData || scanData.status === 'idle') return 'Starting scan…';
    if (scanData.status === 'scanning') {
      const pct = scanData.poolSize > 0 ? Math.round((scanData.scanned / scanData.poolSize) * 100) : 0;
      return `Scanning Russell 3000… checked ${scanData.scanned} of ${scanData.poolSize} (${pct}%) · ${scanData.found} found`;
    }
    return '';
  };

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[#1A2942] mb-2">Stock Research</h1>
        <p className="text-neutral-600">High-quality businesses trading at a meaningful discount to intrinsic value</p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                High-Quality Buy Candidates
              </CardTitle>
              <CardDescription>
                Exceptional or Good quality businesses with ≥ {MIN_DISCOUNT_PCT}% discount to estimated intrinsic value · Russell 3000 universe
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{progressLabel()}</span>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={handleRefresh}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Refresh</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Symbol</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Current Price</TableHead>
                  <TableHead className="text-right">Intrinsic Value</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead>Quality</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-6 w-20 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-6 w-20 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-6 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : stocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="py-12 text-center">
                        <ShieldCheck className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
                        <p className="font-medium text-neutral-600">No high-quality buys at current prices</p>
                        <p className="text-sm text-neutral-400 mt-1 max-w-md mx-auto">
                          {scanData?.poolSize
                            ? `Scanned ${scanData.scanned} of ${scanData.poolSize} Russell 3000 companies — none currently meet both the quality and ≥${MIN_DISCOUNT_PCT}% discount thresholds.`
                            : `No companies currently meet both the quality and ≥${MIN_DISCOUNT_PCT}% discount thresholds.`}
                          {' '}Check back when the market pulls back.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  stocks.map(stock => (
                    <TableRow key={stock.symbol}>
                      <TableCell className="font-medium">{stock.symbol}</TableCell>
                      <TableCell>{stock.name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(stock.price)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(stock.intrinsicValue)}</TableCell>
                      <TableCell className="text-right text-green-600 font-medium">-{stock.discount.toFixed(1)}%</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getQualityBadgeColor(stock.quality)}>
                          {stock.quality}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {!isLoading && stocks.length > 0 && stocks.length < 3 && (
            <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <strong>Slim pickings:</strong> only {stocks.length} {stocks.length === 1 ? 'company' : 'companies'} in the Russell 3000 currently meet both the quality and ≥{MIN_DISCOUNT_PCT}% discount criteria. This typically means markets are broadly valued. More opportunities tend to appear after corrections.
            </div>
          )}

          <div className="mt-6 text-xs text-neutral-500 space-y-1">
            {lastUpdated && <p>Last updated: {lastUpdated}</p>}
            {cacheExpiration && <p>Next full refresh: {cacheExpiration}</p>}
            <p>Quality: Exceptional = ROE &gt; 20%, D/E &lt; 0.5, current ratio &gt; 1.5 · Good = ROE &gt; 15%, D/E &lt; 1, current ratio &gt; 1.2</p>
            <p>Discount = gap between current price and average DCF / P/E / Graham intrinsic value. Only gaps ≥ {MIN_DISCOUNT_PCT}% shown.</p>
            <p className="font-medium">Server scans the Russell 3000 one company at a time to avoid API rate limits. Results are cached for 24 hours.</p>
          </div>
        </CardContent>
      </Card>

      <EmailReportCard />

      <Card className="mt-8 border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-medium text-amber-800 mb-2">Research Disclaimer</h3>
              <p className="text-sm text-amber-700">
                This information is provided for research and educational purposes only. It is not intended as investment advice.
                All stock valuations are estimates based on public data and our proprietary valuation methods.
                Always conduct your own research and consult with a financial advisor before making investment decisions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResearchPage;
