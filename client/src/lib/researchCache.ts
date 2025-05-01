import { ResearchStock } from '@/types/research';

// Cache key for the research data
const RESEARCH_CACHE_KEY = 'research_data_cache';
const RESEARCH_CACHE_TIMESTAMP = 'research_data_timestamp';

// Cache duration in milliseconds (one week)
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get cached research data if available and not expired
 */
export function getCachedResearchData(): { data: ResearchStock[] | null, needsRefresh: boolean } {
  try {
    // Check if there's cached data and timestamp
    const cachedDataString = localStorage.getItem(RESEARCH_CACHE_KEY);
    const cachedTimestampString = localStorage.getItem(RESEARCH_CACHE_TIMESTAMP);
    
    if (!cachedDataString || !cachedTimestampString) {
      return { data: null, needsRefresh: true };
    }
    
    // Parse timestamp and check if cache has expired
    const cachedTimestamp = parseInt(cachedTimestampString, 10);
    const now = Date.now();
    const isExpired = now - cachedTimestamp > CACHE_DURATION;
    
    if (isExpired) {
      return { data: null, needsRefresh: true };
    }
    
    // Return cached data
    return { 
      data: JSON.parse(cachedDataString) as ResearchStock[],
      needsRefresh: false 
    };
  } catch (error) {
    console.error('Error reading from research cache:', error);
    return { data: null, needsRefresh: true };
  }
}

/**
 * Save research data to cache with current timestamp
 */
export function saveResearchDataToCache(data: ResearchStock[]): void {
  try {
    const now = Date.now();
    localStorage.setItem(RESEARCH_CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(RESEARCH_CACHE_TIMESTAMP, now.toString());
  } catch (error) {
    console.error('Error saving to research cache:', error);
  }
}

/**
 * Get the expiration date of the current cache as a formatted string
 */
export function getCacheExpirationDate(): string {
  try {
    const cachedTimestampString = localStorage.getItem(RESEARCH_CACHE_TIMESTAMP);
    
    if (!cachedTimestampString) {
      return 'Unknown';
    }
    
    const cachedTimestamp = parseInt(cachedTimestampString, 10);
    const expirationTimestamp = cachedTimestamp + CACHE_DURATION;
    const expirationDate = new Date(expirationTimestamp);
    
    return expirationDate.toLocaleString();
  } catch (error) {
    console.error('Error getting cache expiration date:', error);
    return 'Unknown';
  }
}

/**
 * Get the last updated date of the cached data
 */
export function getCacheLastUpdated(): string {
  try {
    const cachedTimestampString = localStorage.getItem(RESEARCH_CACHE_TIMESTAMP);
    
    if (!cachedTimestampString) {
      return 'Unknown';
    }
    
    const cachedTimestamp = parseInt(cachedTimestampString, 10);
    const lastUpdatedDate = new Date(cachedTimestamp);
    
    return lastUpdatedDate.toLocaleString();
  } catch (error) {
    console.error('Error getting last updated date:', error);
    return 'Unknown';
  }
}