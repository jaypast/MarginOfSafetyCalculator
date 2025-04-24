import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

interface CacheStats {
  cacheHits: number;
  cacheMisses: number;
  cachedQueries: number;
  apiCalls: number;
}

// This hook can be used in development/admin tools to monitor cache effectiveness
export function useCacheStats() {
  const queryClient = useQueryClient();
  const [stats, setStats] = useState<CacheStats>({
    cacheHits: 0,
    cacheMisses: 0,
    cachedQueries: 0,
    apiCalls: 0,
  });

  // Calculate cache stats
  useEffect(() => {
    const cachedQueries = queryClient.getQueryCache().getAll();
    
    let hits = 0;
    let misses = 0;
    let apiCalls = 0;
    
    // Calculate hits and misses based on state
    cachedQueries.forEach(query => {
      const state = query.state;
      
      // Count each successful query as an API call
      if (state.status === 'success') {
        misses += 1;  // Each success means at least one API call was made
        apiCalls += 1;
        
        // If the query has been observed more than once, the extra observations are cache hits
        // This is an estimation since TanStack Query v5 doesn't expose fetchCount directly
        if (state.dataUpdateCount > 1) {
          hits += state.dataUpdateCount - 1;
          apiCalls += state.dataUpdateCount - 1;  // Count total data accesses
        }
      }
    });
    
    setStats({
      cacheHits: hits,
      cacheMisses: misses,
      cachedQueries: cachedQueries.length,
      apiCalls,
    });
  }, [queryClient]);

  return stats;
}