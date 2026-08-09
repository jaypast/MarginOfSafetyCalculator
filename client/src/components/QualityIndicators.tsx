import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  StockData, 
  CompanyQualityResult
} from '@/lib/types';
import { computeVmsScore, VmsTier } from '@/lib/vmsScore';
import {
  type InsiderSignal,
  type InsiderSignalTier,
  isOpenMarketPurchase,
  formatCurrency,
  formatDate,
} from '@/lib/insiderSignal';

interface QualityIndicatorsProps {
  stockData: StockData;
  companyQuality: CompanyQualityResult | null;
  insiderSignal?: InsiderSignal | null;
}

const INSIDER_BADGE: Record<InsiderSignalTier, { label: string; className: string }> = {
  'cluster-buy': { label: 'Cluster Buy', className: 'bg-teal-100 text-teal-800 border-teal-200' },
  'recent-buy':  { label: 'Recent Buying', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  'no-signal':   { label: 'No Signal', className: 'bg-neutral-100 text-neutral-700 border-neutral-200' },
  'sell-only':   { label: 'Selling Only', className: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
};

const QualityIndicators: React.FC<QualityIndicatorsProps> = ({
  stockData,
  companyQuality,
  insiderSignal,
}) => {
  const getProgressWidth = (value: number, benchmark: number, inverse: boolean = false) => {
    if (inverse) {
      // For metrics where lower is better (like debt ratios)
      if (value <= benchmark / 3) return '90%';
      if (value <= benchmark / 2) return '80%';
      if (value <= benchmark) return '70%';
      if (value <= benchmark * 1.5) return '50%';
      if (value <= benchmark * 2) return '30%';
      return '20%';
    } else {
      // For metrics where higher is better (like ROE)
      if (value >= benchmark * 2) return '90%';
      if (value >= benchmark * 1.5) return '80%';
      if (value >= benchmark) return '70%';
      if (value >= benchmark / 2) return '50%';
      if (value >= benchmark / 3) return '30%';
      return '20%';
    }
  };
  
  const getIndicatorColor = (value: number, benchmark: number, inverse: boolean = false) => {
    if (inverse) {
      // For metrics where lower is better (like debt ratios)
      if (value <= benchmark) return 'bg-green-500'; // Good/Strong/Preferred
      if (value <= benchmark * 1.5) return 'bg-amber-500'; // Average/Moderate
      return 'bg-red-500'; // Below average/Weak
    } else {
      // For metrics where higher is better (like ROE)
      if (value >= benchmark) return 'bg-green-500'; // Good/Strong/Preferred
      if (value >= benchmark / 2) return 'bg-amber-500'; // Average/Moderate
      return 'bg-red-500'; // Below average/Weak
    }
  };
  
  const getStabilityColor = (stability: string) => {
    if (stability === 'High') return 'bg-green-500';
    if (stability === 'Medium') return 'bg-amber-500';
    return 'bg-red-500';
  };
  
  const getCompetitivePositionColor = (position: string) => {
    if (position === 'Strong' || position === 'Good') return 'bg-green-500';
    if (position === 'Average') return 'bg-amber-500';
    return 'bg-red-500';
  };
  
  const getTextColor = (value: number, benchmark: number, inverse: boolean = false) => {
    if (inverse) {
      // For metrics where lower is better (like debt ratios)
      if (value <= benchmark) return 'text-green-600'; // Good/Strong/Preferred
      if (value <= benchmark * 1.5) return 'text-amber-600'; // Average/Moderate
      return 'text-red-600'; // Below average/Weak
    } else {
      // For metrics where higher is better (like ROE)
      if (value >= benchmark) return 'text-green-600'; // Good/Strong/Preferred
      if (value >= benchmark / 2) return 'text-amber-600'; // Average/Moderate
      return 'text-red-600'; // Below average/Weak
    }
  };

  const getQualityColorClass = (quality?: string) => {
    switch (quality) {
      case 'Exceptional':
        return 'text-success-700';
      case 'Good':
        return 'text-teal-700';
      case 'Average':
        return 'text-amber-700';
      case 'Speculative':
        return 'text-rose-700';
      default:
        return 'text-neutral-700';
    }
  };

  return (
    <Card className="bg-white rounded-lg shadow-sm border border-neutral-200">
      <CardContent className="p-4">
        <h2 className="text-lg sm:text-xl font-semibold text-[#1A2942] mb-2">
          Quality Indicators {stockData && <span className="text-sm font-normal">- {stockData.name}</span>}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Financial Strength */}
          <div>
            <h3 className="text-sm font-medium text-[#21324F] mb-3">Financial Strength</h3>
            
            <div className="space-y-3">
              {/* Return on Equity */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-neutral-600">Return on Equity</span>
                  <span className={`text-sm font-medium ${getTextColor(stockData.roe, 15)}`}>{stockData.roe.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full">
                  <div 
                    className={`h-2 ${getIndicatorColor(stockData.roe, 15)} rounded-full`}
                    style={{ width: getProgressWidth(stockData.roe, 15) }}
                  ></div>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {stockData.roe >= 30 ? 'Excellent' : stockData.roe >= 15 ? 'Strong' : stockData.roe >= 10 ? 'Good' : 'Average'} 
                  {' '}(above 15% is strong)
                </p>
              </div>
              
              {/* Debt to Equity */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-neutral-600">Debt to Equity</span>
                  <span className={`text-sm font-medium ${getTextColor(stockData.debtToEquity, 1, true)}`}>{stockData.debtToEquity.toFixed(1)}</span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full">
                  <div 
                    className={`h-2 ${getIndicatorColor(stockData.debtToEquity, 1, true)} rounded-full`}
                    style={{ width: getProgressWidth(stockData.debtToEquity, 1, true) }}
                  ></div>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {stockData.debtToEquity < 0.3 ? 'Very Low' : stockData.debtToEquity < 0.7 ? 'Low' : stockData.debtToEquity < 1 ? 'Moderate' : 'High'} 
                  {' '}(less than 1.0 is preferred)
                </p>
              </div>
              
              {/* Short-Term Liquidity (Current Ratio) */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-neutral-600">Short-Term Liquidity</span>
                  <span className={`text-sm font-medium ${getTextColor(stockData.currentRatio, 1.5)}`}>{stockData.currentRatio.toFixed(1)}</span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full">
                  <div 
                    className={`h-2 ${getIndicatorColor(stockData.currentRatio, 1.5)} rounded-full`}
                    style={{ width: getProgressWidth(stockData.currentRatio, 1.5) }}
                  ></div>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {stockData.currentRatio >= 2 ? 'Excellent' : stockData.currentRatio >= 1.5 ? 'Strong' : stockData.currentRatio >= 1 ? 'Adequate' : 'Weak'} 
                  {' '}(1.5 or above is preferred)
                </p>
              </div>
            </div>
          </div>
          
          {/* Growth & Stability */}
          <div>
            <h3 className="text-sm font-medium text-[#21324F] mb-3">Growth & Stability</h3>
            
            <div className="space-y-3">
              {/* Revenue Growth */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-neutral-600">Revenue Growth (5Y)</span>
                  <span className={`text-sm font-medium ${getTextColor(stockData.revenueGrowth, 10)}`}>{stockData.revenueGrowth.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full">
                  <div 
                    className={`h-2 ${getIndicatorColor(stockData.revenueGrowth, 10)} rounded-full`}
                    style={{ width: getProgressWidth(stockData.revenueGrowth, 10) }}
                  ></div>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {stockData.revenueGrowth >= 15 ? 'Excellent' : stockData.revenueGrowth >= 10 ? 'Good' : stockData.revenueGrowth >= 5 ? 'Moderate' : 'Slow'} 
                  {' '}(above 10% annually)
                </p>
              </div>
              
              {/* Earnings Stability */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-neutral-600">Earnings Stability</span>
                  <span className={`text-sm font-medium ${
                    stockData.earningsStability === 'High' ? 'text-green-600' : 
                    stockData.earningsStability === 'Medium' ? 'text-amber-600' : 
                    'text-red-600'
                  }`}>{stockData.earningsStability}</span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full">
                  <div 
                    className={`h-2 ${getStabilityColor(stockData.earningsStability)} rounded-full`}
                    style={{ width: stockData.earningsStability === 'High' ? '85%' : stockData.earningsStability === 'Medium' ? '60%' : '30%' }}
                  ></div>
                </div>
                <p className="text-xs text-neutral-500 mt-1">Consistent earnings over past 5 years</p>
              </div>
              
              {/* Competitive Position */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-neutral-600">Competitive Position</span>
                  <span className={`text-sm font-medium ${
                    stockData.competitivePosition === 'Strong' ? 'text-green-600' : 
                    stockData.competitivePosition === 'Good' ? 'text-green-600' : 
                    stockData.competitivePosition === 'Average' ? 'text-amber-600' : 
                    'text-red-600'
                  }`}>{stockData.competitivePosition}</span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full">
                  <div 
                    className={`h-2 ${getCompetitivePositionColor(stockData.competitivePosition)} rounded-full`}
                    style={{ width: stockData.competitivePosition === 'Strong' ? '90%' : stockData.competitivePosition === 'Good' ? '70%' : '40%' }}
                  ></div>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {stockData.competitivePosition === 'Strong' ? 'Market leader with significant moat' : 
                   stockData.competitivePosition === 'Good' ? 'Competitive advantages in key areas' : 
                   'Average competitive positioning'}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {companyQuality && (
          <div className="mt-6 p-4 bg-neutral-50 rounded-md border border-neutral-200">
            <h3 className="text-sm font-medium text-[#21324F] mb-2">Margin of Safety Recommendation</h3>
            <p className="text-sm text-neutral-600 mb-2">
              Based on the quality indicators, this stock qualifies as an <strong className={getQualityColorClass(companyQuality.quality)}>{companyQuality.quality} Quality</strong> company.
            </p>
            <p className="text-sm text-neutral-600">
              Recommended Margin of Safety: <strong>{companyQuality.recommendedMarginOfSafety}</strong>
            </p>
          </div>
        )}

        {/* Business Model — VMS assessment (parallel dimension, doesn't change quality tier) */}
        {(() => {
          const vms = computeVmsScore(stockData);
          const tierColors: Record<VmsTier, string> = {
            'VMS-Like': 'bg-emerald-100 text-emerald-800 border-emerald-200',
            'Software Characteristics': 'bg-blue-100 text-blue-800 border-blue-200',
            'Mixed': 'bg-neutral-100 text-neutral-800 border-neutral-200',
            'Asset-Heavy': 'bg-neutral-100 text-neutral-700 border-neutral-200',
          };
          return (
            <div className="mt-3 p-4 bg-neutral-50 rounded-md border border-neutral-200">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                <h3 className="text-sm font-medium text-[#21324F]">Business Model</h3>
                <Badge
                  variant="outline"
                  className={`text-xs ${tierColors[vms.tier]}`}
                  data-testid="vms-tier-badge"
                >
                  {vms.tier}
                </Badge>
              </div>
              <p className="text-xs text-neutral-600">{vms.rationale}</p>
              {vms.signals.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {vms.signals.map((s, i) => (
                    <li key={i} className="text-xs text-neutral-500 flex items-start gap-1">
                      <span className="text-emerald-500 mt-0.5">✓</span>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-neutral-400 mt-2">
                Score: {vms.score}/100 · Does not affect quality tier or valuation
              </p>
            </div>
          );
        })()}

        {/* Insider Activity (Task #74) — shown when signal data is available.
            Selling activity appears in the table but generates no badge
            change: insider selling is largely noise. */}
        {insiderSignal && (() => {
          const badge = INSIDER_BADGE[insiderSignal.tier];
          return (
            <div className="mt-3 p-4 bg-neutral-50 rounded-md border border-neutral-200">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                <h3 className="text-sm font-medium text-[#21324F]">Insider Activity</h3>
                <Badge
                  variant="outline"
                  className={`text-xs ${badge.className}`}
                  data-testid="insider-activity-badge"
                >
                  {badge.label}
                </Badge>
              </div>
              <p className="text-xs text-neutral-600">{insiderSignal.summary}</p>

              {/* Compact trade micro-table — no card borders, tight padding */}
              {insiderSignal.recentTrades.length > 0 && (
                <div className="mt-2 space-y-0 divide-y divide-neutral-100">
                  {insiderSignal.recentTrades.map((t, i) => {
                    const isPurchase = isOpenMarketPurchase(t.transactionType);
                    const value = t.securitiesTransacted * t.price;
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-[1fr_auto_auto] gap-x-2 py-1 text-xs"
                      >
                        <span className="text-neutral-700 truncate leading-tight">
                          {t.reportingName}
                        </span>
                        <span
                          className={`font-medium tabular-nums ${
                            isPurchase ? 'text-teal-700' : 'text-neutral-500'
                          }`}
                        >
                          {isPurchase ? '+' : '−'}{value > 0 ? formatCurrency(value) : '—'}
                        </span>
                        <span className="text-neutral-400 whitespace-nowrap">
                          {formatDate(t.transactionDate)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-xs text-neutral-400 mt-2">
                SEC Form 4 via FMP · Buying is signal; selling is noise
              </p>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
};

export default QualityIndicators;
