import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  StockData, 
  CompanyQualityResult
} from '@/lib/types';

interface QualityIndicatorsProps {
  stockData: StockData;
  companyQuality: CompanyQualityResult | null;
}

const QualityIndicators: React.FC<QualityIndicatorsProps> = ({
  stockData,
  companyQuality
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
        <h2 className="text-xl font-semibold text-[#1A2942] mb-2">
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
                  <span className="text-sm font-medium text-green-600">{stockData.roe.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full">
                  <div 
                    className="h-2 bg-green-500 rounded-full"
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
                  <span className="text-sm font-medium text-green-600">{stockData.debtToEquity.toFixed(1)}</span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full">
                  <div 
                    className="h-2 bg-green-500 rounded-full"
                    style={{ width: getProgressWidth(stockData.debtToEquity, 1, true) }}
                  ></div>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {stockData.debtToEquity < 0.3 ? 'Very Low' : stockData.debtToEquity < 0.7 ? 'Low' : stockData.debtToEquity < 1 ? 'Moderate' : 'High'} 
                  {' '}(less than 1.0 is preferred)
                </p>
              </div>
              
              {/* Current Ratio */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-neutral-600">Current Ratio</span>
                  <span className="text-sm font-medium text-green-600">{stockData.currentRatio.toFixed(1)}</span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full">
                  <div 
                    className="h-2 bg-green-500 rounded-full"
                    style={{ width: getProgressWidth(stockData.currentRatio, 1.5) }}
                  ></div>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {stockData.currentRatio >= 2 ? 'Excellent' : stockData.currentRatio >= 1.5 ? 'Strong' : stockData.currentRatio >= 1 ? 'Adequate' : 'Weak'} 
                  {' '}(above 1.5 is preferred)
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
                  <span className="text-sm font-medium text-green-600">{stockData.revenueGrowth.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full">
                  <div 
                    className="h-2 bg-green-500 rounded-full"
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
                  <span className="text-sm font-medium text-green-600">{stockData.earningsStability}</span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full">
                  <div 
                    className="h-2 bg-green-500 rounded-full"
                    style={{ width: stockData.earningsStability === 'High' ? '85%' : stockData.earningsStability === 'Medium' ? '60%' : '30%' }}
                  ></div>
                </div>
                <p className="text-xs text-neutral-500 mt-1">Consistent earnings over past 5 years</p>
              </div>
              
              {/* Competitive Position */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-neutral-600">Competitive Position</span>
                  <span className="text-sm font-medium text-green-600">{stockData.competitivePosition}</span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full">
                  <div 
                    className="h-2 bg-green-500 rounded-full"
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
      </CardContent>
    </Card>
  );
};

export default QualityIndicators;
