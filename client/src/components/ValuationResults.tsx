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
import { Button } from '@/components/ui/button';
import { FileText, TrendingDown, TrendingUp, Pause, Info, Activity } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StockData, ValuationResult, CalculationMethod, ValuationParams, MarginOfSafetyParams, ReverseDCFResult } from '@/lib/types';
import { formatCurrency, isETF, getInvestmentRecommendation } from '@/lib/utils';
import { generateCalculationsPDF } from '@/utils/pdfGenerator';
import { trackEvent } from '@/lib/analytics';
import { calculateDiscountPremium } from '@/lib/calculators';
import EntryTimingBanner from './EntryTimingBanner';
import { computeVmsScore } from '@/lib/vmsScore';

interface ValuationResultsProps {
  valuationResults: ValuationResult[];
  stockData: StockData | undefined;
  activeMethod: CalculationMethod;
  valuationParams?: ValuationParams;
  marginOfSafetyParams?: MarginOfSafetyParams;
  reverseDCFResult?: ReverseDCFResult | null;
}

const ValuationResults: React.FC<ValuationResultsProps> = ({
  valuationResults,
  stockData,
  activeMethod,
  valuationParams,
  marginOfSafetyParams,
  reverseDCFResult
}) => {
  // Add state for dialog control and report content
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportContent, setReportContent] = useState("");
  
  // Check if the stock is an ETF
  const etfDetected = stockData && isETF(stockData);
  
  // We've removed the useEffect as the parent component now handles all the recalculations
  
  if (!valuationResults.length) {
    return (
      <Card className="bg-white rounded-lg shadow-sm border border-neutral-200">
        <CardContent className="p-4">
          <h2 className="text-lg sm:text-xl font-semibold text-[#1A2942] mb-2">Valuation Results</h2>
          <div className="text-center py-8 text-neutral-500">
            <p>Enter a stock symbol and click "Calculate Intrinsic Value" to view results</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // If ETF is detected, show a special information card
  if (etfDetected) {
    return (
      <Card className="bg-white rounded-lg shadow-sm border border-neutral-200">
        <CardContent className="p-4">
          <h2 className="text-lg sm:text-xl font-semibold text-[#1A2942] mb-2">
            Valuation Results {stockData && <span className="text-sm font-normal">- {stockData.name}</span>}
          </h2>
          
          {stockData && (
            <div className="flex items-center mb-3 bg-blue-50 p-2 rounded-md border border-blue-100 inline-block">
              <p className="text-sm text-blue-700 mr-2">Current Price:</p>
              <p className="text-lg font-bold text-blue-800">{formatCurrency(stockData.price)}</p>
            </div>
          )}
          
          <div className="bg-amber-50 p-4 rounded-lg mb-4 border border-amber-100">
            <h3 className="text-lg font-medium text-amber-700 mb-2">ETF or Index Fund Detected</h3>
            <p className="text-sm text-gray-700 mb-2">
              This appears to be an ETF or Index Fund. These investments track baskets of securities and 
              don't represent individual companies, so traditional valuation methods like DCF or P/E ratios 
              don't apply.
            </p>
            <p className="text-sm text-gray-700">
              Consider these factors instead:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-700 mt-2 space-y-1 ml-2">
              <li>Expense ratio (lower is better)</li>
              <li>Tracking error vs benchmark</li>
              <li>Liquidity and trading volume</li>
              <li>Sector/asset allocation</li>
              <li>Historical performance</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Find average result (we'll prioritize this for display)
  const averageResult = valuationResults.find(
    result => result.method === 'Average'
  );
  
  // Find active method result - use average if available, otherwise fallback to selected method
  // This ensures our main valuation metrics align with the recommendation
  const activeResult = averageResult || valuationResults.find(
    result => result.method.toLowerCase().includes(activeMethod)
  ) || valuationResults[0];
  
  // Check for special cases like MicroStrategy with negative or extreme values
  const hasNegativeIntrinsicValue = activeResult.intrinsicValue <= 0;
  const hasExtremeDiscountPremium = Math.abs(activeResult.discountPremium) > 5000;
  const isSpecialCase = hasNegativeIntrinsicValue || hasExtremeDiscountPremium;
  
  // Determine status color
  const getStatusColor = (discountPremium: number): string => {
    if (discountPremium <= -10) return 'text-green-800';
    if (discountPremium < 0) return 'text-amber-800';
    return 'text-red-800';
  };

  return (
    <Card className="bg-white rounded-lg shadow-sm border border-neutral-200">
      <CardContent className="p-4">
        <h2 className="text-lg sm:text-xl font-semibold text-[#1A2942] mb-2">
          Valuation Results {stockData && <span className="text-sm font-normal">- {stockData.name}</span>}
        </h2>
        
        {/* Current Price - Added at the top for prominence */}
        {stockData && (
          <div className="flex items-center mb-3 bg-blue-50 p-2 rounded-md border border-blue-100 inline-block">
            <p className="text-sm text-blue-700 mr-2">Current Price:</p>
            <p className="text-lg font-bold text-blue-800">{formatCurrency(stockData.price)}</p>
          </div>
        )}
        
        {isSpecialCase ? (
          // Special message for stocks with negative or extreme values
          <div className="bg-amber-50 p-4 rounded-lg mb-4 border border-amber-100">
            <h3 className="text-lg font-medium text-amber-700 mb-2">Special Case Detected</h3>
            <p className="text-sm text-gray-700 mb-2">
              This company appears to have characteristics that make traditional valuation methods challenging:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-700 ml-2 mb-2">
              {hasNegativeIntrinsicValue && <li>Negative or unpredictable earnings</li>}
              {hasExtremeDiscountPremium && <li>Extremely high growth expectations or non-standard business model</li>}
              {stockData?.symbol === 'MSTR' && <li>Large Bitcoin holdings that affect traditional valuation metrics</li>}
            </ul>
            <p className="text-sm text-gray-700">
              Consider using alternative valuation approaches or conducting deeper research into this company's specific situation.
            </p>
          </div>
        ) : (
          <>
            {/* Prominent action recommendation */}
            {averageResult && (
              <div className="mb-6">
                {(() => {
                  // Get recommendation based on average result
                  const recommendation = getInvestmentRecommendation(averageResult.discountPremium);
                  
                  // Determine styling based on recommendation
                  const styles: Record<string, {
                    background: string;
                    border: string;
                    text: string;
                    icon: React.ReactNode;
                  }> = {
                    'UNDERVALUED': {
                      background: "bg-green-100", 
                      border: "border-green-300",
                      text: "text-green-800",
                      icon: <TrendingDown className="h-6 w-6 text-green-600 mr-2" />
                    },
                    'FAIRLY VALUED': {
                      background: "bg-amber-100", 
                      border: "border-amber-300",
                      text: "text-amber-800",
                      icon: <Pause className="h-6 w-6 text-amber-600 mr-2" />
                    },
                    'OVERVALUED': {
                      background: "bg-red-100", 
                      border: "border-red-300",
                      text: "text-red-800",
                      icon: <TrendingUp className="h-6 w-6 text-red-600 mr-2" />
                    }
                  };
                  
                  const style = styles[recommendation.action];
                  
                  return (
                    <div className={`${style.background} p-4 rounded-lg ${style.border} flex flex-col items-center justify-center`}>
                      <div className="flex items-center justify-center mb-2">
                        {style.icon}
                        <h3 className={`text-2xl font-bold ${style.text}`}>
                          {recommendation.action}
                        </h3>
                      </div>
                      <p className={`text-sm ${style.text} text-center`}>
                        {recommendation.rationale}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          
            {/* Valuation metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {/* Intrinsic Value */}
              <div className="bg-[#E9ECF1] p-3 rounded-lg border border-[#C4CCD9]">
                <p className="text-xs text-[#2A3E5C] mb-1">Intrinsic Value</p>
                <p className="text-lg font-bold text-[#1A2942]">
                  {activeResult.intrinsicValue > 0 ? formatCurrency(activeResult.intrinsicValue) : 'N/A'}
                </p>
                <p className="text-xs text-[#415876]">{activeResult.method}</p>
              </div>
              
              {/* Buy Below Price */}
              <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                <p className="text-xs text-green-700 mb-1">Buy Below</p>
                <p className="text-lg font-bold text-green-800">
                  {activeResult.buyBelow > 0 ? formatCurrency(activeResult.buyBelow) : 'N/A'}
                </p>
                <p className="text-xs text-green-600">With MoS</p>
              </div>
              
              {/* Current Status vs Intrinsic Value (FIXED VALUE) */}
              <div className={`${activeResult.discountPremium < 0 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'} p-3 rounded-lg`}>
                <p className={`text-xs ${activeResult.discountPremium < 0 ? 'text-amber-700' : 'text-red-700'} mb-1`}>Vs Intrinsic Value</p>
                <p className={`text-lg font-bold ${getStatusColor(activeResult.discountPremium)}`}>
                  {!hasExtremeDiscountPremium ? 
                    `${activeResult.discountPremium > 0 ? '+' : ''}${activeResult.discountPremium.toFixed(1)}%` 
                    : 'N/A'}
                </p>
                <p className={`text-xs ${activeResult.discountPremium < 0 ? 'text-amber-600' : 'text-red-600'}`}>
                  Market vs Fair Value
                </p>
              </div>
              
              {/* Current Status vs Buy Below Price (CHANGES WITH MARGIN OF SAFETY) */}
              {activeResult.buyBelowStatus !== undefined && (
                <div className={`${activeResult.buyBelowStatus < 0 ? 'bg-green-100 border-green-200' : 'bg-red-50 border-red-100'} p-3 rounded-lg`}>
                  <p className={`text-xs ${activeResult.buyBelowStatus < 0 ? 'text-green-700' : 'text-red-700'} mb-1`}>Vs Buy Below Price</p>
                  <p className={`text-lg font-bold ${activeResult.buyBelowStatus < 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {activeResult.buyBelowStatus > 0 ? `+${activeResult.buyBelowStatus.toFixed(1)}%` : `${activeResult.buyBelowStatus.toFixed(1)}%`}
                  </p>
                  <p className={`text-xs ${activeResult.buyBelowStatus < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    With MoS
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Entry Timing Warning */}
        {!isSpecialCase && !etfDetected && valuationResults.length > 0 && (
          <div className="mb-4">
            <EntryTimingBanner />
          </div>
        )}
        
        {/* Method Comparison */}
        <div>
          <h3 className="text-base font-medium text-[#21324F] mb-2">Valuation Methods</h3>
          <div className="space-y-3 sm:hidden">
            {valuationResults.map((result) => {
              const isAverage = result.method === 'Average';
              return (
                <div
                  key={result.method}
                  className={`rounded-lg border p-3 ${isAverage ? 'border-[#C4CCD9] bg-[#E9ECF1]' : 'border-neutral-200 bg-white'}`}
                >
                  <h4 className={`mb-3 text-sm font-semibold ${isAverage ? 'text-[#21324F]' : 'text-neutral-800'}`}>
                    {result.method}
                  </h4>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <dt className="text-xs text-neutral-500">Intrinsic Value</dt>
                      <dd className={`mt-0.5 text-sm ${isAverage ? 'font-semibold text-[#21324F]' : 'font-medium text-neutral-800'}`}>
                        {result.intrinsicValue <= 0 ? 'N/A' : formatCurrency(result.intrinsicValue)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Buy Below</dt>
                      <dd className={`mt-0.5 text-sm ${isAverage ? 'font-semibold text-[#21324F]' : 'font-medium text-neutral-800'}`}>
                        {result.buyBelow <= 0 ? 'N/A' : formatCurrency(result.buyBelow)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Vs Intrinsic</dt>
                      <dd className={`mt-0.5 text-sm font-medium ${result.discountPremium < 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {result.intrinsicValue <= 0
                          ? 'N/A'
                          : `${result.discountPremium > 0 ? '+' : ''}${result.discountPremium.toFixed(1)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Vs Buy Below</dt>
                      <dd className={`mt-0.5 text-sm font-medium ${result.buyBelowStatus !== undefined && result.buyBelowStatus < 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {result.buyBelowStatus !== undefined && result.buyBelow > 0
                          ? `${result.buyBelowStatus > 0 ? '+' : ''}${result.buyBelowStatus.toFixed(1)}%`
                          : 'N/A'}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
            {reverseDCFResult && stockData && (() => {
              const { impliedGrowthRate, status, interpretation } = reverseDCFResult;
              const isNotApplicable = status === 'not_applicable';
              const impliedDisplay = isNotApplicable
                ? 'N/A'
                : status === 'above_max'
                ? `>${impliedGrowthRate.toFixed(0)}%`
                : status === 'below_min'
                ? `<${impliedGrowthRate.toFixed(0)}%`
                : `${impliedGrowthRate.toFixed(1)}%`;
              const hasHistorical = stockData.growthRate > 0;
              const historicalDisplay = hasHistorical ? `${stockData.growthRate.toFixed(1)}%` : 'N/A';
              const gap = hasHistorical && status === 'solved'
                ? parseFloat((impliedGrowthRate - stockData.growthRate).toFixed(1))
                : null;
              const gapDisplay = gap === null ? 'N/A' : `${gap > 0 ? '+' : ''}${gap.toFixed(1)} pts`;
              const gapClass = gap === null ? 'text-neutral-600' : gap > 0 ? 'text-red-600' : 'text-green-600';

              return (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div className="mb-3 flex items-center">
                    <Activity className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                    <h4 className="text-sm font-semibold text-blue-900">Reverse DCF</h4>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <dt className="text-xs text-blue-600">Market-implied growth</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-blue-900">{impliedDisplay}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-blue-600">Historical growth</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-blue-900">{historicalDisplay}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-blue-600">Gap vs historical</dt>
                      <dd className={`mt-0.5 text-sm font-semibold ${gapClass}`}>{gapDisplay}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs italic text-blue-800">{interpretation}</p>
                </div>
              );
            })()}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Method</TableHead>
                  <TableHead className="text-right">Intrinsic Value</TableHead>
                  <TableHead className="text-right">Buy Below</TableHead>
                  <TableHead className="text-right">Vs Intrinsic</TableHead>
                  <TableHead className="text-right">Vs Buy Below</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valuationResults.filter(r => r.method !== 'Average').map((result, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-neutral-800">{result.method}</TableCell>
                    <TableCell className="text-neutral-800 text-right">
                      {result.intrinsicValue <= 0 ? 'N/A' : formatCurrency(result.intrinsicValue)}
                    </TableCell>
                    <TableCell className="text-neutral-800 text-right">
                      {result.buyBelow <= 0 ? 'N/A' : formatCurrency(result.buyBelow)}
                    </TableCell>
                    <TableCell className={`${result.discountPremium < 0 ? 'text-green-600' : 'text-red-600'} text-right`}>
                      {result.intrinsicValue <= 0 ? 'N/A' : 
                        `${result.discountPremium > 0 ? '+' : ''}${result.discountPremium.toFixed(1)}%`}
                    </TableCell>
                    <TableCell className={`${result.buyBelowStatus && result.buyBelowStatus < 0 ? 'text-green-600' : 'text-red-600'} text-right`}>
                      {result.buyBelowStatus !== undefined && result.buyBelow > 0 ? 
                        `${result.buyBelowStatus > 0 ? '+' : ''}${result.buyBelowStatus.toFixed(1)}%` : 'N/A'}
                    </TableCell>
                  </TableRow>
                ))}
                {averageResult && (
                  <TableRow className="bg-[#E9ECF1]">
                    <TableCell className="font-medium text-[#21324F]">{averageResult.method}</TableCell>
                    <TableCell className="font-medium text-[#21324F] text-right">{formatCurrency(averageResult.intrinsicValue)}</TableCell>
                    <TableCell className="font-medium text-[#21324F] text-right">{formatCurrency(averageResult.buyBelow)}</TableCell>
                    <TableCell className={`font-medium ${averageResult.discountPremium < 0 ? 'text-green-600' : 'text-red-600'} text-right`}>
                      {averageResult.discountPremium > 0 ? '+' : ''}{averageResult.discountPremium.toFixed(1)}%
                    </TableCell>
                    <TableCell className={`font-medium ${averageResult.buyBelowStatus && averageResult.buyBelowStatus < 0 ? 'text-green-600' : 'text-red-600'} text-right`}>
                      {averageResult.buyBelowStatus !== undefined ? 
                        `${averageResult.buyBelowStatus > 0 ? '+' : ''}${averageResult.buyBelowStatus.toFixed(1)}%` : 'N/A'}
                    </TableCell>
                  </TableRow>
                )}
                {/* Reverse DCF — appended as a sibling row of DCF / P/E /
                    Graham / Average so users see all four methods side-by-side.
                    The reverse DCF is a growth rate, not an intrinsic value,
                    so the cells re-purpose the existing columns to show
                    implied growth / historical growth / gap rather than
                    forcing it into the "intrinsic value" / "buy below" frame. */}
                {reverseDCFResult && stockData && (() => {
                  const { impliedGrowthRate, status, interpretation } = reverseDCFResult;
                  const isNotApplicable = status === 'not_applicable';
                  const impliedDisplay = isNotApplicable
                    ? 'N/A'
                    : status === 'above_max'
                    ? `>${impliedGrowthRate.toFixed(0)}%`
                    : status === 'below_min'
                    ? `<${impliedGrowthRate.toFixed(0)}%`
                    : `${impliedGrowthRate.toFixed(1)}%`;
                  const hasHistorical = stockData.growthRate > 0;
                  const historicalDisplay = hasHistorical ? `${stockData.growthRate.toFixed(1)}%` : 'N/A';
                  const gap = hasHistorical && status === 'solved'
                    ? parseFloat((impliedGrowthRate - stockData.growthRate).toFixed(1))
                    : null;
                  const gapDisplay = gap === null
                    ? 'N/A'
                    : `${gap > 0 ? '+' : ''}${gap.toFixed(1)} pts`;
                  const gapClass = gap === null
                    ? 'text-neutral-600'
                    : gap > 0 ? 'text-red-600' : 'text-green-600';
                  return (
                    <>
                      <TableRow className="bg-blue-50 border-t-2 border-blue-200">
                        <TableCell className="font-medium text-blue-900">
                          <div className="flex items-center">
                            <Activity className="w-3.5 h-3.5 text-blue-600 mr-1.5" />
                            Reverse DCF
                          </div>
                          <div className="text-xs font-normal text-blue-600 ml-5">implied growth</div>
                        </TableCell>
                        <TableCell className="font-medium text-blue-900 text-right">{impliedDisplay}</TableCell>
                        <TableCell className="font-medium text-blue-900 text-right">{historicalDisplay}</TableCell>
                        <TableCell className={`font-medium ${gapClass} text-right`}>{gapDisplay}</TableCell>
                        <TableCell className="text-blue-700 text-right text-xs">vs. historical</TableCell>
                      </TableRow>
                      <TableRow className="bg-blue-50">
                        <TableCell colSpan={5} className="text-sm italic text-blue-800 pt-0">
                          {interpretation}
                        </TableCell>
                      </TableRow>
                    </>
                  );
                })()}
              </TableBody>
            </Table>
          </div>
          {reverseDCFResult && stockData && (
            <p className="text-xs text-neutral-500 mt-2">
              Reverse DCF columns re-purpose the row to show <span className="font-medium">market-implied growth</span> / <span className="font-medium">company historical growth</span> / <span className="font-medium">gap (pts)</span>.
            </p>
          )}
        </div>

        {/* Applied adjustments — surfaces every cap, override, and fallback
            so the user can see *why* a number is what it is rather than
            having to trust the model blindly. */}
        {!isSpecialCase && !etfDetected && (() => {
          const allAdjustments = valuationResults
            .filter(r => r.method !== 'Average' && r.appliedAdjustments && r.appliedAdjustments.length > 0)
            .map(r => ({ method: r.method, items: r.appliedAdjustments! }));
          if (allAdjustments.length === 0) return null;
          return (
            <div className="mt-6 bg-neutral-50 border border-neutral-200 rounded-md p-3">
              <div className="flex items-center mb-2">
                <Info className="w-4 h-4 text-neutral-500 mr-2" />
                <h3 className="text-sm font-medium text-neutral-700">
                  Applied adjustments
                </h3>
              </div>
              <p className="text-xs text-neutral-500 mb-2">
                Caps, overrides and fallbacks applied during these calculations.
              </p>
              <div className="space-y-2">
                {allAdjustments.map(({ method, items }) => (
                  <div key={method}>
                    <p className="text-xs font-medium text-neutral-600">{method}</p>
                    <ul className="list-disc list-inside text-xs text-neutral-600 ml-2 space-y-0.5">
                      {items.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* VMS DCF confidence note — shown when VMS score ≥ 75 so the user
            understands WHY they can place more trust in these estimates. */}
        {stockData && !isSpecialCase && !etfDetected && (() => {
          const vms = computeVmsScore(stockData);
          if (vms.score < 75) return null;
          return (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <Info className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-800">
                <span className="font-semibold">VMS-Like business</span> — this company scores {vms.score}/100 on Constellation Software&apos;s
                Vertical Market Software criteria. High gross margins, predictable recurring cash flows, and low leverage make DCF analysis
                more reliable here than for a typical cyclical or high-growth business. The estimates above carry higher-than-usual confidence.
              </p>
            </div>
          );
        })()}

        {/* Show Work Button - Display Report in Dialog */}
        {stockData && valuationParams && marginOfSafetyParams && !etfDetected && !isSpecialCase && (
          <div className="mt-6 flex justify-center">
            <Button 
              variant="outline" 
              className="flex items-center gap-2 border-[#1A2942] text-[#1A2942] hover:bg-[#E9ECF1]"
              onClick={() => {
                // Generate the report content
                const content = generateCalculationsPDF(
                  stockData,
                  valuationParams,
                  marginOfSafetyParams,
                  valuationResults
                );
                trackEvent('report_generated', {
                  ticker: stockData.symbol,
                  location: 'valuation_results',
                });
                setReportContent(content);
                setShowReportDialog(true);
              }}
              title="View detailed valuation calculations"
            >
              <FileText size={18} />
              Show Work
            </Button>
          </div>
        )}
        
        {/* Dialog for showing the report */}
        <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                Valuation Calculation Details: {stockData?.name} ({stockData?.symbol})
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[70vh] rounded border p-4 bg-gray-50">
              <pre className="font-mono text-sm whitespace-pre-wrap">{reportContent}</pre>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default ValuationResults;