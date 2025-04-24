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
}

const ValuationMethod: React.FC<ValuationMethodProps> = ({
  activeMethod,
  setActiveMethod,
  valuationParams,
  setValuationParams,
  stockData
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
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-neutral-200">
      <h2 className="text-xl font-semibold text-[#1A2942] mb-4">Valuation Method</h2>
      
      <div className="flex border border-neutral-300 rounded-md overflow-hidden">
        <button 
          className={`tab-button flex-1 py-2.5 text-center text-sm font-medium ${activeMethod === 'dcf' ? 'active' : ''}`}
          onClick={() => setActiveMethod('dcf')}
        >
          DCF Analysis
        </button>
        <button 
          className={`tab-button flex-1 py-2.5 text-center text-sm font-medium ${activeMethod === 'pe' ? 'active' : ''}`}
          onClick={() => setActiveMethod('pe')}
        >
          P/E Based
        </button>
        <button 
          className={`tab-button flex-1 py-2.5 text-center text-sm font-medium ${activeMethod === 'graham' ? 'active' : ''}`}
          onClick={() => setActiveMethod('graham')}
        >
          Graham Formula
        </button>
      </div>
      
      {/* DCF Inputs */}
      <div className={`tab-content mt-5 ${activeMethod !== 'dcf' ? 'hidden' : ''}`}>
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
            <Input
              type="number"
              className="transition-all duration-300 border border-neutral-300 focus:border-[#1A2942] focus:ring-2 focus:ring-[#1A2942]/10"
              value={valuationParams.dcfGrowthRate}
              onChange={(e) => handleParamChange('dcfGrowthRate', e.target.value)}
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
            <Input
              type="number"
              className="transition-all duration-300 border border-neutral-300 focus:border-[#1A2942] focus:ring-2 focus:ring-[#1A2942]/10"
              value={valuationParams.dcfDiscountRate}
              onChange={(e) => handleParamChange('dcfDiscountRate', e.target.value)}
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
            <Input
              type="number"
              className="custom-input"
              value={valuationParams.dcfTerminalMultiple}
              onChange={(e) => handleParamChange('dcfTerminalMultiple', e.target.value)}
              min={0}
              max={50}
              step={0.1}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Forecast Period (Years)</label>
            <Select
              value={valuationParams.dcfForecastPeriod.toString()}
              onValueChange={(value) => handleParamChange('dcfForecastPeriod', parseInt(value))}
            >
              <SelectTrigger className="custom-input">
                <SelectValue placeholder="Select forecast period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 Years</SelectItem>
                <SelectItem value="7">7 Years</SelectItem>
                <SelectItem value="10">10 Years</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      {/* P/E Based Inputs */}
      <div className={`tab-content mt-5 ${activeMethod !== 'pe' ? 'hidden' : ''}`}>
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
            <Select
              value={valuationParams.peType}
              onValueChange={(value) => handleParamChange('peType', value)}
            >
              <SelectTrigger className="custom-input">
                <SelectValue placeholder="Select P/E type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current P/E ({stockData ? stockData.peRatio.toFixed(1) : '-'})</SelectItem>
                <SelectItem value="5year">5-Year Average (18.6)</SelectItem>
                <SelectItem value="10year">10-Year Average (16.2)</SelectItem>
                <SelectItem value="industry">Industry Average (22.5)</SelectItem>
                <SelectItem value="custom">Custom P/E...</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {valuationParams.peType === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Custom P/E Ratio</label>
              <Input
                type="number"
                className="custom-input"
                value={valuationParams.peCustomValue}
                onChange={(e) => handleParamChange('peCustomValue', e.target.value)}
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
      <div className={`tab-content mt-5 ${activeMethod !== 'graham' ? 'hidden' : ''}`}>
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
            <Input
              type="number"
              className="custom-input"
              value={valuationParams.grahamGrowthRate}
              onChange={(e) => handleParamChange('grahamGrowthRate', e.target.value)}
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
            <Input
              type="number"
              className="custom-input"
              value={valuationParams.grahamBaseValue}
              onChange={(e) => handleParamChange('grahamBaseValue', e.target.value)}
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
