/**
 * Simple in-memory cache with TTL (Time To Live) for API responses
 * 
 * This improves performance by:
 * 1. Reducing redundant API calls to external services
 * 2. Decreasing response times for frequently requested stocks
 * 3. Lowering the load on the Yahoo Finance API
 */

interface CacheItem<T> {
  data: T;
  expiresAt: number;
}

class CacheManager {
  private cache: Map<string, CacheItem<any>>;
  private defaultTTL: number; // Time to live in milliseconds

  constructor(defaultTTL = 5 * 60 * 1000) { // Default 5 minutes
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get item from cache
   * @param key Cache key
   * @returns The cached data or null if not found/expired
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    // Return null if item doesn't exist
    if (!item) {
      return null;
    }
    
    // Check if item has expired
    if (Date.now() > item.expiresAt) {
      // Remove expired item
      this.cache.delete(key);
      return null;
    }
    
    return item.data as T;
  }

  /**
   * Set item in cache
   * @param key Cache key
   * @param data Data to cache
   * @param ttl Time to live in milliseconds (optional, uses default if not provided)
   */
  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { data, expiresAt });
  }

  /**
   * Delete item from cache
   * @param key Cache key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   * @returns Number of items in cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get a list of all active cache keys
   * @returns Array of cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Run garbage collection to remove expired items
   * @returns Number of items removed
   */
  garbageCollect(): number {
    const now = Date.now();
    let removed = 0;
    
    // Get all keys first and then iterate
    const keys = this.keys();
    
    for (const key of keys) {
      const item = this.cache.get(key);
      if (item && now > item.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    return removed;
  }
}

// Create and export a singleton instance
export const cacheManager = new CacheManager();

/**
 * Utility function to wrap an async function with caching
 * @param fn Function to cache
 * @param keyFn Function to generate cache key from args
 * @param ttl Time to live in milliseconds
 * @returns Cached function
 */
export function withCache<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T>,
  keyFn: (...args: Args) => string,
  ttl?: number
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    const key = keyFn(...args);
    const cachedResult = cacheManager.get<T>(key);
    
    if (cachedResult !== null) {
      console.log(`Cache hit for key: ${key}`);
      return cachedResult;
    }
    
    console.log(`Cache miss for key: ${key}`);
    const result = await fn(...args);
    cacheManager.set(key, result, ttl);
    return result;
  };
}

// Schedule garbage collection every hour
setInterval(() => {
  const removed = cacheManager.garbageCollect();
  if (removed > 0) {
    console.log(`Cache garbage collection removed ${removed} expired items`);
  }
}, 60 * 60 * 1000); // 1 hour