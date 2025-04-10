import { StockResponse } from '@shared/schema';

interface CacheItem {
  data: StockResponse;
  expiry: number;
}

class StockDataCache {
  private cache: Map<string, CacheItem> = new Map();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  get(symbol: string): StockResponse | null {
    const item = this.cache.get(symbol);
    
    if (!item) {
      return null;
    }
    
    // Check if the cache item is expired
    if (Date.now() > item.expiry) {
      this.cache.delete(symbol);
      return null;
    }
    
    return item.data;
  }

  set(symbol: string, data: StockResponse, ttl = this.DEFAULT_TTL): void {
    const expiry = Date.now() + ttl;
    this.cache.set(symbol, { data, expiry });
    
    // Log cache status
    console.log(`Cache updated for ${symbol}. Cache size: ${this.cache.size} items`);
  }

  invalidate(symbol: string): void {
    this.cache.delete(symbol);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Export a singleton instance
export const stockCache = new StockDataCache();