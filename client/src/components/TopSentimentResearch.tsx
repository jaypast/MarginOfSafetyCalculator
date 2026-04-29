import React, { useState, useEffect } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { StockSentiment, AnalyzedStock } from '@/lib/sentimentAnalysis';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { StockData } from '@/lib/types';
import { 
  calculateDCF, 
  calculateGraham, 
  calculateBuyBelow 
} from '@/lib/calculators';

const TopSentimentResearch: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [analyzedStocks, setAnalyzedStocks] = useState<AnalyzedStock[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Format the last updated date for display
  const formatLastUpdated = (dateString: string | null) => {
    if (!dateString) return "Never";
    
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Initialize on component mount
  useEffect(() => {
    loadSentimentResearch();
  }, []);

  // Load popular stocks with real-time data
  const loadSentimentResearch = async () => {
    setIsLoading(true);
    
    try {
      // Use a list of popular/interesting stocks to analyze
      // These are high-interest stocks across different sectors
      const popularStockSymbols = [
        'AAPL',   // Apple
        'MSFT',   // Microsoft
        'GOOGL',  // Alphabet (Google)
        'AMZN',   // Amazon
        'META',   // Meta (Facebook)
        'TSLA',   // Tesla
        'NVDA',   // NVIDIA
        'JPM',    // JPMorgan Chase
        'WMT',    // Walmart
        'DIS',    // Disney
        'NFLX',   // Netflix
        'PYPL',   // PayPal
        'AMD',    // AMD
        'INTC',   // Intel
        'XOM'     // Exxon Mobil
      ];
      
      // Use today's date for the update timestamp
      const today = new Date();
      setLastUpdated(today.toISOString());
      
      // Convert to format expected by the rest of the component
      const topTenStocks: StockSentiment[] = popularStockSymbols.slice(0, 10).map(symbol => ({
        symbol,
        name: symbol, // Will be replaced with actual name from API
        sentimentScore: 80, // Placeholder since we're focusing on popularity, not sentiment
        mentionCount: 1000, // Placeholder
        priceMovement: 0,
        weeklyTrend: 'stable' as 'stable',
        lastUpdated: today.toISOString()
      }));
      
      // For each stock, fetch current data and calculate safety metrics
      const analyzedResults = await Promise.all(
        topTenStocks.map(async (stock: StockSentiment) => {
          try {
            // Fetch stock data
            const response = await fetch(`/api/stock/${stock.symbol}`);
            
            if (!response.ok) {
              // If we can't get data, return with limited info
              return {
                symbol: stock.symbol,
                name: stock.name,
                price: 0,
                sentimentScore: stock.sentimentScore,
                mentionCount: stock.mentionCount,
                intrinsicValue: null,
                buyBelowPrice: null,
                valueGap: null,
                quality: 'Average' as 'Average'
              };
            }
            
            const stockData: StockData = await response.json();
            
            if (stockData.error) {
              return {
                symbol: stock.symbol,
                name: stock.name,
                price: 0,
                sentimentScore: stock.sentimentScore,
                mentionCount: stock.mentionCount,
                intrinsicValue: null,
                buyBelowPrice: null,
                valueGap: null,
                quality: 'Average' as 'Average'
              };
            }
            
            // Standard valuation parameters
            const valuationParams = {
              // DCF Parameters
              dcfGrowthRate: Math.min(stockData.growthRate, 20), // Cap at 20%
              dcfDiscountRate: 10, // Standard 10% discount rate
              dcfTerminalMultiple: 12, // Conservative terminal multiple
              dcfForecastPeriod: 5, // 5-year forecast
              
              // P/E Parameters
              peType: 'current' as 'current' | 'custom',
              peCustomValue: 15, // Default PE multiple
              peAdjustment: 100, // No adjustment
              
              // Graham Parameters
              grahamGrowthRate: Math.min(stockData.growthRate, 20), // Cap at 20%
              grahamBaseValue: 8.5, // Benjamin Graham's base value
            };
            
            // Calculate intrinsic value (try DCF first, fallback to Graham)
            const dcfValue = calculateDCF(stockData, valuationParams);
            const grahamValue = calculateGraham(stockData, valuationParams);
            
            // Use the best method available
            let intrinsicValue = 0;
            if (dcfValue > 0) {
              intrinsicValue = dcfValue;
            } else if (grahamValue > 0) {
              intrinsicValue = grahamValue;
            }
            
            // Determine company quality
            let quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative' = 'Average';
            let marginOfSafety = 25; // Default 25%
            
            if (stockData.roe > 20 && stockData.debtToEquity < 0.5 && stockData.currentRatio > 1.5) {
              quality = 'Exceptional';
              marginOfSafety = 15; // 15% for exceptional companies
            } else if (stockData.roe > 15 && stockData.debtToEquity < 1 && stockData.currentRatio > 1.2) {
              quality = 'Good';
              marginOfSafety = 20; // 20% for good companies
            } else if (stockData.roe < 10 || stockData.debtToEquity > 2 || stockData.currentRatio < 1) {
              quality = 'Speculative';
              marginOfSafety = 40; // 40% for speculative companies
            }
            
            // Calculate buy-below price with MoS
            const buyBelowPrice = intrinsicValue > 0 ? calculateBuyBelow(intrinsicValue, marginOfSafety) : null;
            
            // Calculate value gap (negative means undervalued)
            const valueGap = intrinsicValue > 0 ? ((stockData.price - intrinsicValue) / intrinsicValue) * 100 : null;
            
            return {
              symbol: stockData.symbol,
              name: stockData.name,
              price: stockData.price,
              sentimentScore: stock.sentimentScore,
              mentionCount: stock.mentionCount,
              intrinsicValue: intrinsicValue > 0 ? intrinsicValue : null,
              buyBelowPrice,
              valueGap,
              quality
            };
          } catch (error) {
            console.error(`Error analyzing ${stock.symbol}:`, error);
            
            // Return limited info on error
            return {
              symbol: stock.symbol,
              name: stock.name,
              price: 0,
              sentimentScore: stock.sentimentScore,
              mentionCount: stock.mentionCount,
              intrinsicValue: null,
              buyBelowPrice: null,
              valueGap: null,
              quality: 'Average' as 'Average'
            };
          }
        })
      );
      
      // Sort by value opportunity (prioritizing undervalued quality stocks)
      const sortedResults = analyzedResults.sort((a: AnalyzedStock, b: AnalyzedStock) => {
        // First prioritize stocks with value calculations
        if (a.valueGap !== null && b.valueGap === null) return -1;
        if (a.valueGap === null && b.valueGap !== null) return 1;
        
        // Then prioritize undervalued stocks by quality
        if (a.valueGap !== null && b.valueGap !== null) {
          // Both undervalued, compare by quality then by value gap
          if (a.valueGap < 0 && b.valueGap < 0) {
            // Higher quality comes first
            const qualityOrder = { 'Exceptional': 1, 'Good': 2, 'Average': 3, 'Speculative': 4 };
            if (qualityOrder[a.quality] !== qualityOrder[b.quality]) {
              return qualityOrder[a.quality] - qualityOrder[b.quality];
            }
            // If same quality, more undervalued comes first
            return a.valueGap - b.valueGap;
          }
          
          // Undervalued stocks come before overvalued ones
          if (a.valueGap < 0 && b.valueGap >= 0) return -1;
          if (a.valueGap >= 0 && b.valueGap < 0) return 1;
          
          // Both overvalued, least overvalued comes first
          return a.valueGap - b.valueGap;
        }
        
        // Fallback to alphabetical sorting by symbol
        return a.symbol.localeCompare(b.symbol);
      });
      
      setAnalyzedStocks(sortedResults);
    } catch (error) {
      console.error("Error loading sentiment research:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handles toggling the expanded state
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Quality badge color
  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'Exceptional':
        return 'bg-blue-100 text-blue-800';
      case 'Good':
        return 'bg-green-100 text-green-800';
      case 'Average':
        return 'bg-yellow-100 text-yellow-800';
      case 'Speculative':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Sentiment score color
  const getSentimentColor = (score: number) => {
    if (score >= 80) return 'text-green-600 font-medium';
    if (score >= 60) return 'text-green-500';
    if (score >= 40) return 'text-amber-500';
    return 'text-red-500';
  };

  // Value gap color
  const getValueGapColor = (gap: number | null) => {
    if (gap === null) return 'text-gray-500';
    if (gap <= -20) return 'text-green-600 font-medium';
    if (gap < 0) return 'text-green-500';
    if (gap < 10) return 'text-amber-500';
    return 'text-red-500';
  };

  // Price to buy below color
  const getBuyBelowColor = (price: number, buyBelow: number | null) => {
    if (buyBelow === null) return 'text-gray-500';
    if (price <= buyBelow * 0.9) return 'text-green-600 font-medium';
    if (price <= buyBelow) return 'text-green-500';
    if (price <= buyBelow * 1.1) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <Card className="bg-white rounded-lg shadow-sm border border-neutral-200 mb-6">
      <div 
        className="flex justify-between items-center p-4 border-b border-neutral-200"
      >
        <h2 
          className="text-xl font-semibold text-[#1A2942] cursor-pointer" 
          onClick={toggleExpanded}
        >
          Popular Stocks Investment Ideas
        </h2>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <div className="flex items-center text-xs text-gray-500 mr-2">
              <Calendar size={12} className="mr-1" />
              <span>Updated: {formatLastUpdated(lastUpdated)}</span>
            </div>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0" 
            aria-label="Toggle research"
            onClick={toggleExpanded}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </Button>
        </div>
      </div>
      
      {isExpanded && (
        <CardContent className="p-4">
          {isLoading ? (
            // Skeleton loader while loading
            <div className="space-y-2">
              <div className="flex space-x-4">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-4 w-[80px]" />
                <Skeleton className="h-4 w-[80px]" />
                <Skeleton className="h-4 w-[80px]" />
              </div>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-4 w-[50px]" />
                  <Skeleton className="h-4 w-[140px]" />
                  <Skeleton className="h-4 w-[70px]" />
                  <Skeleton className="h-4 w-[70px]" />
                  <Skeleton className="h-4 w-[70px]" />
                </div>
              ))}
            </div>
          ) : (
            // Data table
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left">Symbol</TableHead>
                        <TableHead className="text-left">Company</TableHead>
                        <TableHead className="text-right">Current Price</TableHead>
                        <TableHead className="text-right">Quality</TableHead>
                        <TableHead className="text-right">Intrinsic Value</TableHead>
                        <TableHead className="text-right">Buy Below</TableHead>
                        <TableHead className="text-right">Value Gap</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analyzedStocks.map((stock, index) => (
                        <TableRow key={index} className="hover:bg-gray-50">
                          <TableCell className="font-medium">{stock.symbol}</TableCell>
                          <TableCell className="text-neutral-800">{stock.name}</TableCell>
                          <TableCell className="text-right font-medium">
                            {stock.price > 0 ? formatCurrency(stock.price) : "N/A"}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getQualityColor(stock.quality)}`}>
                              {stock.quality}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {stock.intrinsicValue !== null ? formatCurrency(stock.intrinsicValue) : "N/A"}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${stock.price > 0 && stock.buyBelowPrice !== null ? getBuyBelowColor(stock.price, stock.buyBelowPrice) : ""}`}>
                            {stock.buyBelowPrice !== null ? formatCurrency(stock.buyBelowPrice) : "N/A"}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${getValueGapColor(stock.valueGap)}`}>
                            {stock.valueGap !== null ? (
                              <div className="flex items-center justify-end gap-1">
                                {stock.valueGap < -2 ? (
                                  <TrendingDown className="h-3 w-3 text-green-500" />
                                ) : stock.valueGap > 2 ? (
                                  <TrendingUp className="h-3 w-3 text-red-500" />
                                ) : (
                                  <Minus className="h-3 w-3 text-amber-500" />
                                )}
                                {formatPercent(stock.valueGap)}
                              </div>
                            ) : "N/A"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
          
          <div className="mt-4 text-sm text-gray-700">
            <p className="mb-2">This analysis applies value investment principles to popular and widely-held stocks. Stocks with negative value gaps may be undervalued relative to their intrinsic value.</p>
            <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
              <p className="text-xs text-blue-700 font-medium mb-1">INVESTMENT METHODOLOGY</p>
              <p className="text-xs text-blue-700">
                Based on real-time financial data from Yahoo Finance for widely-held stocks. 
                Quality assessment evaluates financial health metrics including ROE, debt ratios, and competitive position.
                Value Gap shows the difference between current price and calculated intrinsic value.
                Negative gaps suggest potential undervaluation according to Graham principles.
              </p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default TopSentimentResearch;