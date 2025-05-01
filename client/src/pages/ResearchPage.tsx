import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { formatCurrency } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

// Define the stock research entry type
interface ResearchStock {
  symbol: string;
  name: string;
  price: number;
  intrinsicValue: number;
  discount: number;
  quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative';
}

const ResearchPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<ResearchStock[]>([]);

  // Sample research data (for prototype purposes)
  // In a production environment, this would come from an API
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      try {
        // In a real implementation, we would fetch this data from an API
        // For this prototype, let's use a sample dataset
        const sampleStocks: ResearchStock[] = [
          { symbol: 'MSFT', name: 'Microsoft Corporation', price: 402.75, intrinsicValue: 450.50, discount: 10.6, quality: 'Exceptional' },
          { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 174.50, intrinsicValue: 205.75, discount: 15.2, quality: 'Exceptional' },
          { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 178.75, intrinsicValue: 215.25, discount: 17.0, quality: 'Good' },
          { symbol: 'META', name: 'Meta Platforms Inc.', price: 510.00, intrinsicValue: 575.80, discount: 11.4, quality: 'Good' },
          { symbol: 'AAPL', name: 'Apple Inc.', price: 170.50, intrinsicValue: 185.25, discount: 8.0, quality: 'Exceptional' },
          { symbol: 'INTC', name: 'Intel Corporation', price: 31.25, intrinsicValue: 42.50, discount: 26.5, quality: 'Average' },
          { symbol: 'CSCO', name: 'Cisco Systems Inc.', price: 48.75, intrinsicValue: 57.00, discount: 14.5, quality: 'Good' },
          { symbol: 'PFE', name: 'Pfizer Inc.', price: 28.25, intrinsicValue: 38.50, discount: 26.6, quality: 'Good' },
          { symbol: 'ORCL', name: 'Oracle Corporation', price: 122.50, intrinsicValue: 135.75, discount: 9.8, quality: 'Good' },
          { symbol: 'WMT', name: 'Walmart Inc.', price: 62.75, intrinsicValue: 72.25, discount: 13.1, quality: 'Exceptional' },
        ];
        
        setStocks(sampleStocks);
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

      {/* Disclaimer Card */}
      <Card className="mb-8 border-amber-200 bg-amber-50">
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

      {/* Research Table */}
      <Card>
        <CardHeader>
          <CardTitle>Potentially Undervalued Stocks</CardTitle>
          <CardDescription>Stocks currently trading below their estimated intrinsic value</CardDescription>
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
            <p>Last updated: {new Date().toLocaleString()}</p>
            <p>Discount percentages represent the difference between current market price and estimated intrinsic value.</p>
            <p>Quality ratings are based on financial stability, competitive position, and historical performance.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResearchPage;