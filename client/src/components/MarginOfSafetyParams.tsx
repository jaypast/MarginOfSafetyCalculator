import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MarginOfSafetyParams as MoSParams, CompanyQualityResult, StockData } from '@/lib/types';

interface MarginOfSafetyParamsProps {
  marginOfSafetyParams: MoSParams;
  setMarginOfSafetyParams: React.Dispatch<React.SetStateAction<MoSParams>>;
  companyQuality: CompanyQualityResult | null;
  onCalculate: () => void;
  stockData: StockData | undefined;
}

const MarginOfSafetyParams: React.FC<MarginOfSafetyParamsProps> = ({
  marginOfSafetyParams,
  setMarginOfSafetyParams,
  companyQuality,
  onCalculate,
  stockData
}) => {
  const handleMarginChange = (values: number[]) => {
    setMarginOfSafetyParams({
      marginOfSafety: values[0]
    });
    
    // Trigger calculation automatically on slider change
    onCalculate();
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-neutral-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-[#1A2942]">Margin of Safety</h2>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="text-neutral-400">
              <i className="ri-question-line"></i>
            </TooltipTrigger>
            <TooltipContent className="w-64">
              <p>Margin of Safety is the difference between intrinsic value and market price that protects investors from estimation errors, market volatility, and unforeseen business challenges.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">Required Margin of Safety (%)</label>
          <div className="flex items-center">
            <Slider
              className="flex-1 mr-3"
              value={[marginOfSafetyParams.marginOfSafety]}
              min={10}
              max={50}
              step={5}
              onValueChange={handleMarginChange}
            />
            <span className="font-medium text-[#21324F] w-12 text-center">
              {marginOfSafetyParams.marginOfSafety}%
            </span>
          </div>
          
          <div className="grid grid-cols-5 text-xs text-neutral-500 mt-1">
            <div className="text-left">10%</div>
            <div className="text-center">20%</div>
            <div className="text-center">30%</div>
            <div className="text-center">40%</div>
            <div className="text-right">50%</div>
          </div>
        </div>
        
        <div className="bg-neutral-50 p-4 rounded-md">
          <h3 className="text-sm font-medium text-[#21324F] mb-2">Recommended Margin of Safety</h3>
          <table className="w-full text-sm">
            <tbody>
              <tr className="text-neutral-600">
                <td className="pb-1">Exceptional Quality:</td>
                <td className="text-right pb-1">15-25%</td>
              </tr>
              <tr className="text-neutral-600 border-b border-neutral-200 pb-1">
                <td className="pb-1">Good Quality:</td>
                <td className="text-right pb-1">25-35%</td>
              </tr>
              <tr className="text-neutral-600 border-b border-neutral-200">
                <td className="py-1">Average Quality:</td>
                <td className="text-right py-1">35-40%</td>
              </tr>
              <tr className="text-neutral-600">
                <td className="pt-1">Speculative:</td>
                <td className="text-right pt-1">40-50%+</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        {/* Calculate button removed - calculations now happen automatically */}
      </div>
    </div>
  );
};

export default MarginOfSafetyParams;
