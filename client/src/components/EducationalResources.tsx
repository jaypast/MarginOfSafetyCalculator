import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';

interface ResourceCardProps {
  title: string;
  description: string;
  searchQuery: string;
}

const ResourceCard: React.FC<ResourceCardProps> = ({ title, description, searchQuery }) => {
  // Create Google search URL with the query
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
  
  return (
    <div className="border border-neutral-200 rounded-md p-4 hover:border-[#415876] hover:shadow-sm transition duration-200">
      <h3 className="text-[#21324F] font-medium mb-2">{title}</h3>
      <p className="text-neutral-600 text-sm mb-3">{description}</p>
      <a 
        href={googleSearchUrl} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="text-[#2A3E5C] hover:text-[#1A2942] text-sm flex items-center"
      >
        <span>Search resources</span> 
        <ExternalLink size={14} className="ml-1" />
      </a>
    </div>
  );
};

const EducationalResources: React.FC = () => {
  const resources = [
    {
      title: "Understanding Intrinsic Value",
      description: "Learn how to determine the true value of a company beyond market price.",
      searchQuery: "how to calculate intrinsic value stocks investment guide"
    },
    {
      title: "Seth Klarman's Principles",
      description: "Explore the key investment principles from \"Margin of Safety\" book.",
      searchQuery: "Seth Klarman margin of safety investment principles guide"
    },
    {
      title: "Valuation Methods Compared",
      description: "Compare the strengths and weaknesses of different valuation methods.",
      searchQuery: "stock valuation methods compared DCF Graham PE ratio guide"
    },
    {
      title: "Quality Assessment Guide",
      description: "How to evaluate company quality to determine appropriate Margin of Safety.",
      searchQuery: "how to assess company quality for value investing margin of safety guide"
    }
  ];

  return (
    <Card id="educational-resources" className="bg-white rounded-lg shadow-sm border border-neutral-200">
      <CardContent className="p-4">
        <h2 className="text-xl font-semibold text-[#1A2942] mb-2">Educational Resources</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {resources.map((resource, index) => (
            <ResourceCard
              key={index}
              title={resource.title}
              description={resource.description}
              searchQuery={resource.searchQuery}
            />
          ))}
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
