import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResearchStock, getCachedResearchData, saveResearchDataToCache, getCacheExpirationDate, getCacheLastUpdated } from '@/lib/researchCache';
import { calculateIntrinsicValue, calculateDiscount, computeStockQuality } from '@/lib/researchCalculations';

const MIN_DISCOUNT_PCT = 10;

const STOCK_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META',
  'NVDA', 'JPM', 'V', 'MA', 'BRK-B',
  'JNJ', 'UNH', 'HD', 'KO', 'ADBE',
  'CRM', 'PG', 'COST', 'LLY', 'TMO',
  'ASML', 'TSM', 'NOW', 'INTU', 'SPGI',
];

const ResearchPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<ResearchStock[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [cacheExpiration, setCacheExpiration] = useState<string>('');
  const [forceRefresh, setForceRefresh] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        const { data: cachedData, needsRefresh } = getCachedResearchData();

        if (cachedData && !needsRefresh && !forceRefresh) {
          setStocks(cachedData);
          setLastUpdated(getCacheLastUpdated());
          setCacheExpiration(getCacheExpirationDate());
          setLoading(false);
          return;
        }

        const stockPromises = STOCK_SYMBOLS.map(async (symbol) => {
          try {
            const response = await fetch(`/api/stock/${symbol}`);
            if (!response.ok) return null;
            const stockData = await response.json();
            if (stockData.error || !stockData.price) return null;

            const quality = computeStockQuality(stockData);
            if (quality !== 'Exceptional' && quality !== 'Good') return null;

            const intrinsicValue = calculateIntrinsicValue(stockData);
            const discount = calculateDiscount(stockData.price, intrinsicValue);

            if (discount < MIN_DISCOUNT_PCT) return null;

            return {
              symbol: stockData.symbol,
              name: stockData.name,
              price: stockData.price,
              intrinsicValue,
              discount,
              quality,
            } satisfies ResearchStock;
          } catch {
            return null;
          }
        });

        const results = await Promise.all(stockPromises);

        const qualityBuys = (results.filter(Boolean) as ResearchStock[])
          .sort((a, b) => b.discount - a.discount)
          .slice(0, 10);

        saveResearchDataToCache(qualityBuys);
        setStocks(qualityBuys);
        setLastUpdated(getCacheLastUpdated());
        setCacheExpiration(getCacheExpirationDate());

        if (forceRefresh) setForceRefresh(false);
      } catch (error) {
        console.error('Error fetching research data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [forceRefresh]);

  const getQualityBadgeColor = (quality: string) => {
    switch (quality) {
      case 'Exceptional': return 'bg-green-100 text-green-800';
      case 'Good':        return 'bg-blue-100 text-blue-800';
      case 'Average':     return 'bg-yellow-100 text-yellow-800';
      case 'Speculative': return 'bg-red-100 text-red-800';
      default:            return 'bg-neutral-100 text-neutral-800';
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[#1A2942] mb-2">Stock Research</h1>
        <p className="text-neutral-600">High-quality businesses trading at a meaningful discount to intrinsic value</p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                High-Quality Buy Candidates
              </CardTitle>
              <CardDescription>
                Exceptional or Good quality businesses with ≥ {MIN_DISCOUNT_PCT}% discount to estimated intrinsic value
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Scanning {STOCK_SYMBOLS.length} companies…</span>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={() => setForceRefresh(true)}
                  disabled={loading}
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
                {loading ? (
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
                ) : stocks.length < 3 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="py-12 text-center">
                        <ShieldCheck className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
                        <p className="font-medium text-neutral-600">No high-quality buys at current prices</p>
                        <p className="text-sm text-neutral-400 mt-1">
                          None of the {STOCK_SYMBOLS.length} tracked companies meet both the quality and ≥{MIN_DISCOUNT_PCT}% discount thresholds right now.
                          Check back when the market pulls back.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  stocks.map((stock) => (
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

          <div className="mt-6 text-xs text-neutral-500 space-y-1">
            {lastUpdated && <p>Last updated: {lastUpdated}</p>}
            {cacheExpiration && <p>Data refreshes automatically: {cacheExpiration}</p>}
            <p>Quality: Exceptional = ROE &gt; 20%, D/E &lt; 0.5, current ratio &gt; 1.5 · Good = ROE &gt; 15%, D/E &lt; 1, current ratio &gt; 1.2</p>
            <p>Discount = gap between current price and average DCF / P/E / Graham intrinsic value. Only gaps ≥ {MIN_DISCOUNT_PCT}% shown.</p>
            <p className="font-medium">Data is cached weekly to minimise API usage. Use Refresh for the latest values.</p>
          </div>
        </CardContent>
      </Card>

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
