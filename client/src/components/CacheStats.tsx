import React from 'react';
import { useCacheStats } from '@/hooks/useCacheStats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BadgeCheck, Server, RefreshCw } from 'lucide-react';

// This component displays cache statistics for performance monitoring
const CacheStats: React.FC = () => {
  const { cacheHits, cacheMisses, cachedQueries, apiCalls } = useCacheStats();
  
  // Calculate cache hit rate as a percentage
  const cacheHitRate = apiCalls > 0 
    ? Math.round((cacheHits / apiCalls) * 100) 
    : 0;
    
  // Calculate API calls saved
  const apiCallsSaved = cacheHits;
  
  return (
    <Card className="shadow-sm bg-white border border-gray-200">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium text-blue-600 flex items-center">
          <Server className="w-4 h-4 mr-1" /> Performance Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="py-0 pb-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center">
            <BadgeCheck className="w-3.5 h-3.5 mr-1 text-green-600" />
            <span className="font-medium">Cache Hit Rate:</span>
            <span className="ml-1">{cacheHitRate}%</span>
          </div>
          <div className="flex items-center">
            <RefreshCw className="w-3.5 h-3.5 mr-1 text-blue-600" />
            <span className="font-medium">API Calls Saved:</span>
            <span className="ml-1">{apiCallsSaved}</span>
          </div>
          <div>
            <span className="font-medium">Cache Hits:</span>
            <span className="ml-1">{cacheHits}</span>
          </div>
          <div>
            <span className="font-medium">Cache Misses:</span>
            <span className="ml-1">{cacheMisses}</span>
          </div>
          <div>
            <span className="font-medium">Cached Queries:</span>
            <span className="ml-1">{cachedQueries}</span>
          </div>
          <div>
            <span className="font-medium">Total API Calls:</span>
            <span className="ml-1">{apiCalls}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CacheStats;