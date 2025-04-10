import React, { useState, useEffect, useMemo, useCallback } from 'react';
import StockInformation from './StockInformation';
import KeyMetrics from './KeyMetrics';
import ValuationMethod from './ValuationMethod';
import MarginOfSafetyParams from './MarginOfSafetyParams';
import ValuationResults from './ValuationResults';
import QualityIndicators from './QualityIndicators';
import EducationalResources from './EducationalResources';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useStockData } from '@/hooks/useStockData';
import { 
  StockData, 
  ValuationParams, 
  MarginOfSafetyParams as MoSParams, 
  ValuationResult,
  CalculationMethod,
  CompanyQualityResult
} from '@/lib/types';
import { 
  calculateDCF, 
  calculatePE, 
  calculateGraham, 
  calculateBuyBelow, 
  calculateDiscountPremium,
  calculateAverageValuation
} from '@/lib/calculators';
import { getCompanyQuality, getRecommendedMarginOfSafety, getDefaultMarginOfSafety } from '@/lib/utils';

const MarginOfSafetyCalculator: React.FC = () => {
  // Stock data state from API
  const { stockData, isLoading, isError, error, fetchStockData } = useStockData();

  // Calculation method state
  const [activeMethod, setActiveMethod] = useState<CalculationMethod>('dcf');
  
  // Valuation parameters state
  const [valuationParams, setValuationParams] = useState<ValuationParams>({
    // DCF Parameters
    dcfGrowthRate: 10,
    dcfDiscountRate: 12,
    dcfTerminalMultiple: 15,
    dcfForecastPeriod: 5,
    
    // P/E Parameters
    peType: '5year',
    peCustomValue: 15,
    peAdjustment: 100,
    
    // Graham Parameters
    grahamGrowthRate: 11.8,
    grahamBaseValue: 8.5
  });
  
  // Margin of Safety parameters state
  const [marginOfSafetyParams, setMarginOfSafetyParams] = useState<MoSParams>({
    marginOfSafety: 25
  });
  
  // Valuation results state
  const [valuationResults, setValuationResults] = useState<ValuationResult[]>([]);
  const [companyQuality, setCompanyQuality] = useState<CompanyQualityResult | null>(null);
  
  // Calculate intrinsic value and buy below price - memoized to prevent unnecessary recalculations
  const calculateIntrinsicValue = useCallback(() => {
    if (!stockData || stockData.error) return;
    
    // Calculate DCF valuation
    const dcfValue = calculateDCF(stockData, valuationParams);
    const dcfBuyBelow = calculateBuyBelow(dcfValue, marginOfSafetyParams.marginOfSafety);
    const dcfDiscountPremium = calculateDiscountPremium(stockData.price, dcfBuyBelow);
    
    // Calculate P/E valuation
    const peValue = calculatePE(stockData, valuationParams);
    const peBuyBelow = calculateBuyBelow(peValue, marginOfSafetyParams.marginOfSafety);
    const peDiscountPremium = calculateDiscountPremium(stockData.price, peBuyBelow);
    
    // Calculate Graham valuation
    const grahamValue = calculateGraham(stockData, valuationParams);
    const grahamBuyBelow = calculateBuyBelow(grahamValue, marginOfSafetyParams.marginOfSafety);
    const grahamDiscountPremium = calculateDiscountPremium(stockData.price, grahamBuyBelow);
    
    // Store results
    const results: ValuationResult[] = [
      {
        method: 'DCF Analysis',
        intrinsicValue: dcfValue,
        buyBelow: dcfBuyBelow,
        discountPremium: dcfDiscountPremium
      },
      {
        method: 'P/E Based',
        intrinsicValue: peValue,
        buyBelow: peBuyBelow,
        discountPremium: peDiscountPremium
      },
      {
        method: 'Graham Formula',
        intrinsicValue: grahamValue,
        buyBelow: grahamBuyBelow,
        discountPremium: grahamDiscountPremium
      }
    ];
    
    // Calculate average
    const avgResult = calculateAverageValuation(results);
    
    setValuationResults([...results, avgResult]);
  }, [stockData, valuationParams, marginOfSafetyParams]);
  
  // Update quality assessment and initialize values when stock data changes
  // We're using a ref to track if we've processed this stock already to prevent infinite loops
  const processedSymbolRef = React.useRef<string | null>(null);
  
  useEffect(() => {
    // Only process if we have stock data and it's a different symbol than what we've processed before
    if (stockData && !stockData.error && processedSymbolRef.current !== stockData.symbol) {
      // Save the current symbol to avoid reprocessing
      processedSymbolRef.current = stockData.symbol;
      
      // Calculate company quality
      const quality = getCompanyQuality(
        stockData.roe,
        stockData.debtToEquity,
        stockData.currentRatio,
        stockData.revenueGrowth,
        stockData.earningsStability,
        stockData.competitivePosition
      );
      
      const recommendedMoS = getRecommendedMarginOfSafety(quality);
      const defaultMoS = getDefaultMarginOfSafety(quality);
      
      // Update quality state
      setCompanyQuality({
        quality,
        recommendedMarginOfSafety: recommendedMoS
      });
      
      // Update MoS parameters
      setMarginOfSafetyParams({
        marginOfSafety: defaultMoS
      });
      
      // Automatically calculate values with a small delay to ensure state updates
      const timer = setTimeout(() => calculateIntrinsicValue(), 300);
      return () => clearTimeout(timer);
    }
  }, [stockData, calculateIntrinsicValue]);
  
  return (
    <>
      {/* Header Section */}
      <header className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-[#1A2942] mb-2">Margin of Safety Calculator</h1>
            <p className="text-neutral-600">Calculate intrinsic value and determine buy-below thresholds following Benjamin Graham's principles</p>
          </div>
          <div className="mt-4 md:mt-0">
            <a href="#educational-resources" className="text-[#2A3E5C] hover:text-[#1A2942] text-sm flex items-center">
              <i className="ri-information-line mr-1"></i>
              Learn more about Margin of Safety
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="grid grid-cols-1 gap-4">
        {/* Stock Information Section */}
        <div>
          <StockInformation 
            stockData={stockData} 
            isLoading={isLoading} 
            onFetchData={fetchStockData}
            error={isError}
            errorMessage={error instanceof Error ? error.message : "Could not retrieve stock data. Please try again."}
            onCalculateManually={calculateIntrinsicValue}
          />
        </div>
        
        {/* Results Section - Made More Prominent */}
        {stockData && !stockData.error && (
          <div className="bg-white rounded-lg shadow-md p-4 border border-neutral-200">
            <div className="mb-3">
              <h2 className="text-xl font-semibold text-[#1A2942] mb-1">
                Valuation Results {stockData && <span className="text-sm font-normal">- {stockData.name}</span>}
              </h2>
              <p className="text-sm text-neutral-600">Intrinsic value calculation based on multiple methods with applied margin of safety</p>
            </div>
            <ValuationResults 
              valuationResults={valuationResults} 
              stockData={stockData}
              activeMethod={activeMethod}
            />
          </div>
        )}
        
        {/* Detailed Calculations Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column - Parameters */}
          <div className="lg:col-span-1 space-y-4">
            {/* Margin of Safety Parameters - Collapsible */}
            {stockData && !stockData.error && (
              <Collapsible className="bg-white rounded-lg shadow-sm border border-neutral-200">
                <div className="p-3 border-b border-neutral-200">
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <h2 className="text-lg font-medium text-[#1A2942]">
                      Margin of Safety {stockData && <span className="text-sm font-normal">- {stockData.name}</span>}
                    </h2>
                    <div className="rounded-full bg-neutral-100 p-1">
                      <ChevronDown className="h-4 w-4 text-neutral-500" />
                    </div>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <div className="p-3">
                    <MarginOfSafetyParams 
                      marginOfSafetyParams={marginOfSafetyParams}
                      setMarginOfSafetyParams={setMarginOfSafetyParams}
                      companyQuality={companyQuality}
                      onCalculate={calculateIntrinsicValue}
                      stockData={stockData}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {/* Valuation Method - Collapsible */}
            {stockData && !stockData.error && (
              <Collapsible className="bg-white rounded-lg shadow-sm border border-neutral-200">
                <div className="p-3 border-b border-neutral-200">
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <h2 className="text-lg font-medium text-[#1A2942]">
                      Valuation Method {stockData && <span className="text-sm font-normal">- {stockData.name}</span>}
                    </h2>
                    <div className="rounded-full bg-neutral-100 p-1">
                      <ChevronDown className="h-4 w-4 text-neutral-500" />
                    </div>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <div className="p-3">
                    <ValuationMethod 
                      activeMethod={activeMethod}
                      setActiveMethod={setActiveMethod}
                      valuationParams={valuationParams}
                      setValuationParams={setValuationParams}
                      stockData={stockData}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {/* Key Metrics Section */}
            {((stockData && !stockData.error) || isLoading) && (
              <KeyMetrics
                stockData={stockData}
                isLoading={isLoading}
                companyQuality={companyQuality?.quality}
              />
            )}
          </div>
          
          {/* Right Column - Quality and Education */}
          <div className="lg:col-span-2 space-y-4">
            {stockData && !stockData.error && companyQuality && (
              <QualityIndicators 
                stockData={stockData}
                companyQuality={companyQuality}
              />
            )}
            
            <EducationalResources />
          </div>
        </div>
      </main>
    </>
  );
};

export default MarginOfSafetyCalculator;
