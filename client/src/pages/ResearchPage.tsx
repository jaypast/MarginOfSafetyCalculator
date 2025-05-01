import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { formatCurrency } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { Loader2 } from 'lucide-react';

// Define the stock research entry type
interface ResearchStock {
  symbol: string;
  name: string;
  price: number;
  intrinsicValue: number;
  discount: number;
  quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative';
}

// Symbols we want to analyze
const STOCK_SYMBOLS = [
  'MSFT', 'GOOGL', 'AMZN', 'META', 'AAPL', 
  'INTC', 'CSCO', 'PFE', 'ORCL', 'WMT'
];

const ResearchPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<ResearchStock[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Fetch real stock data from our API
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      try {
        const stockPromises = STOCK_SYMBOLS.map(async (symbol) => {
          const response = await fetch(`/api/stock/${symbol}`);
          if (!response.ok) {
            throw new Error(`Failed to fetch data for ${symbol}`);
          }
          const stockData = await response.json();
          
          // Calculate intrinsic value (using simplified DCF calculation)
          // In a real app, we'd use more sophisticated valuation methods
          const growthRate = stockData.growthRate;
          const eps = stockData.eps;
          const peRatio = Math.min(stockData.peRatio * 0.9, 20); // Cap P/E for conservative estimate
          
          let intrinsicValue = eps * (1 + growthRate / 100) * peRatio;
          intrinsicValue = Math.max(stockData.price * 0.8, intrinsicValue); // Prevent extreme undervaluation
          
          const discount = ((intrinsicValue - stockData.price) / intrinsicValue) * 100;
          
          return {
            symbol: stockData.symbol,
            name: stockData.name,
            price: stockData.price,
            intrinsicValue: intrinsicValue,
            discount: Math.max(0, discount), // Only show positive discounts (undervalued)
            quality: stockData.companyQuality || 'Average'
          };
        });
        
        const stockResults = await Promise.all(stockPromises);
        
        // Sort by discount (highest first)
        const sortedStocks = stockResults
          .filter(stock => stock.discount > 0) // Only show undervalued stocks
          .sort((a, b) => b.discount - a.discount)
          .slice(0, 10); // Limit to top 10
        
        setStocks(sortedStocks);
        setLastUpdated(new Date().toLocaleString());
      } catch (error) {
        console.error('Error fetching research data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getQualityBadgeColor = (quality: string) => {
    switch (quality) {
      case 'Exceptional': return 'bg-green-100 text-green-800';
      case 'Good': return 'bg-blue-100 text-blue-800';
      case 'Average': return 'bg-yellow-100 text-yellow-800';
      case 'Speculative': return 'bg-red-100 text-red-800';
      default: return 'bg-neutral-100 text-neutral-800';
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[#1A2942] mb-2">Stock Research</h1>
        <p className="text-neutral-600">Potential undervalued companies based on fundamental analysis</p>
      </header>

      {/* Research Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Potentially Undervalued Stocks</CardTitle>
              <CardDescription>Stocks currently trading below their estimated intrinsic value</CardDescription>
            </div>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Fetching real-time data...</span>
              </div>
            )}
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
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  // Loading skeletons
                  Array(10).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-6 w-20 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-6 w-20 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-6 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-6 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  stocks.map((stock) => (
                    <TableRow key={stock.symbol}>
                      <TableCell className="font-medium">{stock.symbol}</TableCell>
                      <TableCell>{stock.name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(stock.price)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(stock.intrinsicValue)}</TableCell>
                      <TableCell className="text-right text-green-600">-{stock.discount.toFixed(1)}%</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${getQualityBadgeColor(stock.quality)}`}>
                          {stock.quality}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/?symbol=${stock.symbol}`} className="text-[#2A3E5C] hover:text-[#1A2942] hover:underline">
                          Analyze
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          <div className="mt-6 text-xs text-neutral-500">
            <p>Last updated: {lastUpdated}</p>
            <p>Discount percentages represent the difference between current market price and estimated intrinsic value.</p>
            <p>Quality ratings are based on financial stability, competitive position, and historical performance.</p>
          </div>
        </CardContent>
      </Card>
      
      {/* Disclaimer at the bottom */}
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