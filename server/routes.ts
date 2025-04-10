import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { stockResponseSchema } from "@shared/schema";
import { getStockData } from "./services/stockData";
import { stockCache } from "./services/cache";
import { ZodError } from "zod";

// Create a periodic cache cleaner to ensure fresh data
function setupCacheCleaner() {
  // Clear all cache entries older than 1 hour every 30 minutes
  const CACHE_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
  
  console.log('Setting up periodic cache cleaner...');
  
  setInterval(() => {
    console.log('Running scheduled cache cleanup...');
    stockCache.clear();
    console.log('Cache cleared successfully');
  }, CACHE_CLEANUP_INTERVAL);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize the cache cleaner
  setupCacheCleaner();
  
  // API Routes
  app.get('/api/stock/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ message: 'Invalid stock symbol' });
      }
      
      const startTime = Date.now();
      const stockData = await getStockData(symbol.toUpperCase());
      const endTime = Date.now();
      
      // Log performance metrics
      console.log(`Stock data retrieval for ${symbol} took ${endTime - startTime}ms`);
      
      // Validate the returned data against our schema
      const validatedData = stockResponseSchema.parse(stockData);
      
      return res.json(validatedData);
    } catch (error) {
      console.error('Error fetching stock data:', error);
      
      if (error instanceof ZodError) {
        return res.status(422).json({ 
          message: 'Invalid data received from financial API',
          details: error.errors 
        });
      }
      
      return res.status(500).json({ 
        message: error instanceof Error ? error.message : 'An unknown error occurred while fetching stock data'
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
