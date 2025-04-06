import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

const EducationalResources: React.FC = () => {
  return (
    <Card id="educational-resources" className="bg-white rounded-lg shadow-sm border border-neutral-200">
      <CardContent className="p-4">
        <h2 className="text-xl font-semibold text-[#1A2942] mb-2">Educational Resources</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-neutral-200 rounded-md p-4 hover:border-[#415876] transition duration-200">
            <h3 className="text-[#21324F] font-medium mb-2">Understanding Intrinsic Value</h3>
            <p className="text-neutral-600 text-sm mb-3">Learn how to determine the true value of a company beyond market price.</p>
            <a href="#" className="text-[#2A3E5C] hover:text-[#1A2942] text-sm flex items-center">
              <span>Read more</span> <i className="ri-arrow-right-line ml-1"></i>
            </a>
          </div>
          
          <div className="border border-neutral-200 rounded-md p-4 hover:border-[#415876] transition duration-200">
            <h3 className="text-[#21324F] font-medium mb-2">Seth Klarman's Principles</h3>
            <p className="text-neutral-600 text-sm mb-3">Explore the key investment principles from "Margin of Safety" book.</p>
            <a href="#" className="text-[#2A3E5C] hover:text-[#1A2942] text-sm flex items-center">
              <span>Read more</span> <i className="ri-arrow-right-line ml-1"></i>
            </a>
          </div>
          
          <div className="border border-neutral-200 rounded-md p-4 hover:border-[#415876] transition duration-200">
            <h3 className="text-[#21324F] font-medium mb-2">Valuation Methods Compared</h3>
            <p className="text-neutral-600 text-sm mb-3">Compare the strengths and weaknesses of different valuation methods.</p>
            <a href="#" className="text-[#2A3E5C] hover:text-[#1A2942] text-sm flex items-center">
              <span>Read more</span> <i className="ri-arrow-right-line ml-1"></i>
            </a>
          </div>
          
          <div className="border border-neutral-200 rounded-md p-4 hover:border-[#415876] transition duration-200">
            <h3 className="text-[#21324F] font-medium mb-2">Quality Assessment Guide</h3>
            <p className="text-neutral-600 text-sm mb-3">How to evaluate company quality to determine appropriate Margin of Safety.</p>
            <a href="#" className="text-[#2A3E5C] hover:text-[#1A2942] text-sm flex items-center">
              <span>Read more</span> <i className="ri-arrow-right-line ml-1"></i>
            </a>
          </div>
        </div>
        
        <div className="mt-4 p-4 bg-[#E9ECF1] rounded-md">
          <div className="flex items-start">
            <i className="ri-information-line text-[#415876] mr-3 mt-0.5 text-lg"></i>
            <div>
              <h3 className="text-[#21324F] font-medium mb-1">Important Reminder</h3>
              <p className="text-sm text-[#2A3E5C]">Intrinsic value calculations are estimates, not precise values. Always consider qualitative factors and use Margin of Safety as a risk-reduction tool, not a guarantee.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EducationalResources;
