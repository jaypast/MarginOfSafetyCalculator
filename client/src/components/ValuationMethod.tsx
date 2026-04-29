import React from 'react';
import { Slider } from '@/components/ui/slider';
import { StyledInput } from '@/components/ui/styled-input';
import { 
  StyledSelect,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/styled-select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StockData, ValuationParams, CalculationMethod } from '@/lib/types';

interface ValuationMethodProps {
  activeMethod: CalculationMethod;
  setActiveMethod: (method: CalculationMethod) => void;
  valuationParams: ValuationParams;
  setValuationParams: React.Dispatch<React.SetStateAction<ValuationParams>>;
  stockData: StockData | undefined;
  onCalculate: () => void; // Add callback to trigger calculations
}

const ValuationMethod: React.FC<ValuationMethodProps> = ({
  activeMethod,
  setActiveMethod,
  valuationParams,
  setValuationParams,
  stockData,
  onCalculate
}) => {
  const handleParamChange = (
    paramName: keyof ValuationParams,
    value: number | string
  ) => {
    setValuationParams((prev) => ({
      ...prev,
      [paramName]: typeof value === 'string' && !isNaN(parseFloat(value)) 
        ? parseFloat(value) 
        : value
    }));
    
    // Trigger calculation after parameter change
    setTimeout(() => onCalculate(), 100);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-neutral-200">
      <h2 className="text-xl font-semibold text-[#1A2942] mb-4">Valuation Method</h2>
      
      <div className="flex border border-neutral-300 rounded-md overflow-hidden">
        <button 
          className={`flex-1 py-2.5 text-center text-sm font-medium transition-all duration-200 ${activeMethod === 'dcf' ? 'bg-[#1A2942] text-white' : ''}`}
          onClick={() => {
            setActiveMethod('dcf');
            setTimeout(() => onCalculate(), 100);
          }}
        >
          DCF Analysis
        </button>
        <button 
          className={`flex-1 py-2.5 text-center text-sm font-medium transition-all duration-200 ${activeMethod === 'pe' ? 'bg-[#1A2942] text-white' : ''}`}
          onClick={() => {
            setActiveMethod('pe');
            setTimeout(() => onCalculate(), 100);
          }}
        >
          P/E Based
        </button>
        <button 
          className={`flex-1 py-2.5 text-center text-sm font-medium transition-all duration-200 ${activeMethod === 'graham' ? 'bg-[#1A2942] text-white' : ''}`}
          onClick={() => {
            setActiveMethod('graham');
            setTimeout(() => onCalculate(), 100);
          }}
        >
          Graham Formula
        </button>
      </div>
      
      {/* DCF Inputs */}
      <div className={`mt-5 ${activeMethod !== 'dcf' ? 'hidden' : ''}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1 flex items-center">
              Growth Rate (%)
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="text-neutral-400 ml-1">
                    <i className="ri-question-line"></i>
                  </TooltipTrigger>
                  <TooltipContent className="w-64">
                    <p>Projected annual growth rate of free cash flow over the forecast period. Historical growth rate is provided as reference.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <StyledInput
              type="number"
              value={valuationParams.dcfGrowthRate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleParamChange('dcfGrowthRate', e.target.value)}
              min={0}
              max={100}
              step={0.1}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Historical: {stockData ? `${stockData.growthRate}% (5Y Average)` : '-'}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1 flex items-center">
              Discount Rate (%)
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="text-neutral-400 ml-1">
                    <i className="ri-question-line"></i>
                  </TooltipTrigger>
                  <TooltipContent className="w-64">
                    <p>Required rate of return used to discount future cash flows to present value. Higher rates result in lower valuations and reflect higher risk.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <StyledInput
              type="number"
              value={valuationParams.dcfDiscountRate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleParamChange('dcfDiscountRate', e.target.value)}
              min={0}
              max={50}
              step={0.1}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1 flex items-center">
              Terminal Multiple
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="text-neutral-400 ml-1">
                    <i className="ri-question-line"></i>
                  </TooltipTrigger>
                  <TooltipContent className="w-64">
                    <p>Multiple applied to the final year's cash flow to determine terminal value. Represents the business value beyond the explicit forecast period.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <StyledInput
              type="number"
              value={valuationParams.dcfTerminalMultiple}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleParamChange('dcfTerminalMultiple', e.target.value)}
              min={0}
              max={50}
              step={0.1}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Forecast Period (Years)</label>
            <StyledSelect
              value={valuationParams.dcfForecastPeriod.toString()}
              onValueChange={(value: string) => handleParamChange('dcfForecastPeriod', parseInt(value))}
            >
              <StyledSelect.Trigger>
                <SelectValue placeholder="Select forecast period" />
              </StyledSelect.Trigger>
              <SelectContent>
                <SelectItem value="5">5 Years</SelectItem>
                <SelectItem value="7">7 Years</SelectItem>
                <SelectItem value="10">10 Years</SelectItem>
              </SelectContent>
            </StyledSelect>
          </div>
        </div>
      </div>
      
      {/* P/E Based Inputs */}
      <div className={`mt-5 ${activeMethod !== 'pe' ? 'hidden' : ''}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1 flex items-center">
              Historical P/E to Use
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="text-neutral-400 ml-1">
                    <i className="ri-question-line"></i>
                  </TooltipTrigger>
                  <TooltipContent className="w-64">
                    <p>P/E ratio used for valuation. Conservative investors often use lower historical P/E ratios to build in additional safety.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <StyledSelect
              value={valuationParams.peType}
              onValueChange={(value: string) => handleParamChange('peType', value)}
            >
              <StyledSelect.Trigger>
                <SelectValue placeholder="Select P/E type" />
              </StyledSelect.Trigger>
              <SelectContent>
                <SelectItem value="current">{`Current P/E (${stockData ? stockData.peRatio.toFixed(1) : '-'})`}</SelectItem>
                <SelectItem value="5year">{`5-year average (${stockData?.peHistory?.fiveYearAvg != null ? stockData.peHistory.fiveYearAvg.toFixed(1) : 'N/A'})`}</SelectItem>
                <SelectItem value="10year">{`10-year average (${stockData?.peHistory?.tenYearAvg != null ? stockData.peHistory.tenYearAvg.toFixed(1) : 'N/A'})`}</SelectItem>
                <SelectItem value="industry">Industry baseline</SelectItem>
                <SelectItem value="custom">Custom P/E...</SelectItem>
              </SelectContent>
            </StyledSelect>
          </div>
          
          {valuationParams.peType === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Custom P/E Ratio</label>
              <StyledInput
                type="number"
                value={valuationParams.peCustomValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleParamChange('peCustomValue', e.target.value)}
                min={1}
                max={100}
                step={0.1}
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1 flex items-center">
              EPS Adjustment
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="text-neutral-400 ml-1">
                    <i className="ri-question-line"></i>
                  </TooltipTrigger>
                  <TooltipContent className="w-64">
                    <p>Optional adjustment to EPS for temporary factors or expected changes. Use 100% for current EPS with no adjustments.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <div className="flex items-center">
              <Slider
                className="flex-1 mr-3"
                value={[valuationParams.peAdjustment]}
                min={50}
                max={150}
                step={1}
                onValueChange={(values) => handleParamChange('peAdjustment', values[0])}
              />
              <span className="text-sm font-medium w-16 text-center">
                {valuationParams.peAdjustment}%
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Graham Formula Inputs */}
      <div className={`mt-5 ${activeMethod !== 'graham' ? 'hidden' : ''}`}>
        <div className="space-y-4">
          <div>
            <p className="block text-sm text-neutral-700 mb-1 italic">Graham Formula: Intrinsic Value = EPS × (8.5 + 2g)</p>
            <p className="block text-xs text-neutral-500 mb-4">Where g = growth rate (capped at 20%)</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1 flex items-center">
              Expected Growth Rate (%)
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="text-neutral-400 ml-1">
                    <i className="ri-question-line"></i>
                  </TooltipTrigger>
                  <TooltipContent className="w-64">
                    <p>Expected annual growth rate for the company. Graham capped this at 20% to maintain conservatism.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <StyledInput
              type="number"
              value={valuationParams.grahamGrowthRate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleParamChange('grahamGrowthRate', e.target.value)}
              min={0}
              max={20}
              step={0.1}
            />
            <p className="mt-1 text-xs text-neutral-500">Note: The Graham formula caps growth at 20%</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1 flex items-center">
              Modified Base (Optional)
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="text-neutral-400 ml-1">
                    <i className="ri-question-line"></i>
                  </TooltipTrigger>
                  <TooltipContent className="w-64">
                    <p>Graham's original formula used 8.5 as the base value. Some investors modify this based on interest rates.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <StyledInput
              type="number"
              value={valuationParams.grahamBaseValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleParamChange('grahamBaseValue', e.target.value)}
              min={0}
              max={20}
              step={0.1}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ValuationMethod;