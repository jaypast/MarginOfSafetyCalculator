import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import {
  stockResponseSchema,
  insertFeedbackSchema,
  insertWatchlistEntrySchema,
  type WatchlistEntryResponse,
} from "@shared/schema";
import { getStockData, acquireYfinanceSlot, releaseYfinanceSlot } from "./services/stockData";
import { getMarketSentiment, getMostActiveStocks, RealTimeSentiment } from "./services/marketSentiment";
import { getHistoricalData } from "./services/yahooFinance";
import { getRapidApiHistoricalData } from "./services/rapidApiFinance";
import { scrapeHistoricalData } from "./services/webScraper";
import { getFallbackHistoricalData } from "./services/fallbackData";
import { ZodError } from "zod";

// Simple admin authentication middleware
// In a production environment, you would use a more robust auth system
// This implementation uses a secret ADMIN_KEY environment variable for authentication
const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = process.env.ADMIN_KEY || "margin-of-safety-admin";
  
  // Check for key in headers (API requests) or query parameters (export URL)
  const headerKey = req.headers['x-admin-key'] as string;
  const queryKey = req.query.key as string;
  const providedKey = headerKey || queryKey;
  
  if (!providedKey || providedKey !== adminKey) {
    // For HTML responses (export page), redirect to admin page
    if (req.path === '/api/feedback/export' && req.accepts('html')) {
      return res.redirect('/admin');
    }
    
    // For API requests, return unauthorized status
    return res.status(401).json({ message: "Unauthorized: Admin access required" });
  }
  
  next();
};

// Watchlist session cookie (Task #14) ----------------------------------------
// We don't have auth yet, so the watchlist is scoped by an opaque, server-set
// UUID stored in a long-lived HttpOnly cookie. This is intentionally minimal:
// no signing, no expiry rotation — when we add real accounts, the entries
// already keyed by sessionId can be migrated to userId in one query.
const WATCHLIST_COOKIE = "wl_session";
const WATCHLIST_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

function getOrSetSessionId(req: Request, res: Response): string {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === WATCHLIST_COOKIE) {
      const value = rest.join("=");
      // Only accept values that look like our UUIDs to prevent header
      // injection or accidentally honouring a value the user pasted by hand.
      if (/^[A-Za-z0-9-]{8,128}$/.test(value)) return value;
    }
  }
  const fresh = randomUUID();
  res.setHeader(
    "Set-Cookie",
    `${WATCHLIST_COOKIE}=${fresh}; Path=/; Max-Age=${WATCHLIST_COOKIE_MAX_AGE}; SameSite=Lax; HttpOnly`,
  );
  return fresh;
}

function toWatchlistResponse(entry: {
  id: number;
  symbol: string;
  marginOfSafety: number;
  createdAt: Date;
}): WatchlistEntryResponse {
  return {
    id: entry.id,
    symbol: entry.symbol,
    marginOfSafety: entry.marginOfSafety,
    createdAt: entry.createdAt instanceof Date
      ? entry.createdAt.toISOString()
      : new Date(entry.createdAt).toISOString(),
  };
}

// Cache for sentiment data to prevent excessive API calls
let sentimentCache: {
  data: RealTimeSentiment[];
  timestamp: number;
} | null = null;

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

export async function registerRoutes(app: Express): Promise<Server> {
  // Simple in-memory cache for historical data
  const historicalDataCache: { 
    [key: string]: { 
      data: any, 
      timestamp: number 
    } 
  } = {};
  const HISTORICAL_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours cache for historical data

  // Historical data route - must be defined before the general stock route
  app.get('/api/stock/:symbol/history', async (req, res) => {
    try {
      const { symbol } = req.params;
      const { period = '5y', interval = '1mo' } = req.query;
      
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ message: 'Invalid stock symbol' });
      }
      
      // Convert parameters to strings
      const periodStr = typeof period === 'string' ? period : '5y';
      const intervalStr = typeof interval === 'string' ? interval : '1mo';
      
      // Create a cache key
      const cacheKey = `${symbol.toUpperCase()}_${periodStr}_${intervalStr}`;
      
      // Check if we have valid cached data
      const now = Date.now();
      if (historicalDataCache[cacheKey] && (now - historicalDataCache[cacheKey].timestamp < HISTORICAL_CACHE_DURATION)) {
        console.log(`Returning cached historical data for ${symbol}`);
        return res.json(historicalDataCache[cacheKey].data);
      }
      
      // Try yfinance (Python) first — most reliable
      // Use the shared concurrency slot to prevent too many simultaneous subprocess calls
      console.log(`Trying yfinance for historical data of ${symbol}`);
      try {
        await acquireYfinanceSlot();
        let yahooData;
        try {
          yahooData = await getHistoricalData(
            symbol.toUpperCase(),
            periodStr,
            intervalStr
          );
        } finally {
          releaseYfinanceSlot();
        }

        historicalDataCache[cacheKey] = { data: yahooData, timestamp: now };
        return res.json(yahooData);
      } catch (yahooError) {
        console.log(`yfinance historical data failed: ${yahooError}`);
        console.log(`Falling back to RapidAPI for historical data of ${symbol}...`);
      }

      // Fall back to RapidAPI
      console.log(`Trying RapidAPI for historical data of ${symbol}`);
      try {
        const rapidApiData = await getRapidApiHistoricalData(
          symbol.toUpperCase(), 
          periodStr,
          intervalStr
        );
        
        historicalDataCache[cacheKey] = { data: rapidApiData, timestamp: now };
        return res.json(rapidApiData);
      } catch (rapidApiError) {
        console.log(`RapidAPI historical data failed: ${rapidApiError}`);
        console.log(`Trying web scraping for historical data of ${symbol}...`);
      }
      
      // Try web scraping as third option
      try {
        console.log(`Web scraping historical data for ${symbol}...`);
        const scrapedData = await scrapeHistoricalData(
          symbol.toUpperCase(),
          periodStr,
          intervalStr
        );
        
        // Cache the successful response
        historicalDataCache[cacheKey] = {
          data: scrapedData,
          timestamp: now
        };
        
        return res.json(scrapedData);
      } catch (scrapeError) {
        console.log(`Web scraping historical data failed: ${scrapeError}`);
        console.log(`Trying fallback data for ${symbol}...`);
      }
      
      // Try static fallback data as last resort
      const fallbackData = getFallbackHistoricalData(
        symbol.toUpperCase(),
        periodStr,
        intervalStr
      );
      
      if (fallbackData) {
        console.log(`Using fallback historical data for ${symbol}`);
        // Cache the fallback data (with shorter expiration)
        historicalDataCache[cacheKey] = {
          data: fallbackData,
          timestamp: now - (20 * 60 * 1000) // Expires in 4 hours instead of 24
        };
        
        return res.json(fallbackData);
      }
      
      // If all methods fail, return an error
      return res.status(404).json({
        message: `Could not retrieve historical data for ${symbol}`
      });
    } catch (error) {
      console.error('Error fetching historical data:', error);
      return res.status(500).json({ 
        message: error instanceof Error ? error.message : 'An unknown error occurred while fetching historical data'
      });
    }
  });

  // API Routes
  app.get('/api/stock/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ message: 'Invalid stock symbol' });
      }
      
      const stockData = await getStockData(symbol.toUpperCase());
      
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

  // New endpoint for stock sentiment analysis
  app.get("/api/sentiment", async (req, res) => {
    try {
      // Check if cached data is still valid
      const now = Date.now();
      if (sentimentCache && (now - sentimentCache.timestamp < CACHE_DURATION)) {
        console.log("Returning cached sentiment data");
        return res.json(sentimentCache.data);
      }
      
      console.log("Fetching fresh market sentiment data");
      let sentimentData: RealTimeSentiment[];
      
      // Try primary source first (trending tickers)
      try {
        sentimentData = await getMarketSentiment();
      } catch (error) {
        console.error("Error with primary sentiment source, trying fallback:", error);
        
        // Fall back to most active stocks
        sentimentData = await getMostActiveStocks();
      }
      
      // Update cache
      sentimentCache = {
        data: sentimentData,
        timestamp: now
      };
      
      return res.json(sentimentData);
    } catch (error) {
      console.error("Error fetching sentiment data:", error);
      return res.status(500).json({
        error: true,
        message: "Failed to retrieve market sentiment data"
      });
    }
  });
  
  // Feedback API routes
  app.post("/api/feedback", async (req, res) => {
    try {
      const feedbackData = insertFeedbackSchema.parse(req.body);
      const savedFeedback = await storage.createFeedback(feedbackData);
      return res.status(201).json(savedFeedback);
    } catch (error) {
      console.error("Error saving feedback:", error);
      
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: 'Invalid feedback data',
          details: error.errors 
        });
      }
      
      return res.status(500).json({ 
        message: error instanceof Error ? error.message : 'An unknown error occurred while saving feedback'
      });
    }
  });
  
  // Admin-only endpoints
  app.get("/api/feedback/stats", adminAuth, async (req, res) => {
    try {
      const stats = await storage.getFeedbackStats();
      return res.json(stats);
    } catch (error) {
      console.error("Error getting feedback stats:", error);
      return res.status(500).json({
        message: error instanceof Error ? error.message : 'An unknown error occurred while fetching feedback stats'
      });
    }
  });
  
  app.get("/api/feedback", adminAuth, async (req, res) => {
    try {
      const allFeedback = await storage.getAllFeedback();
      
      // Sort by date (most recent first)
      const sortedFeedback = allFeedback.sort((a, b) => {
        const dateA = new Date(a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt || '');
        const dateB = new Date(b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt || '');
        return dateB.getTime() - dateA.getTime();
      });
      
      return res.json(sortedFeedback);
    } catch (error) {
      console.error("Error getting feedback:", error);
      return res.status(500).json({
        message: error instanceof Error ? error.message : 'An unknown error occurred while fetching feedback'
      });
    }
  });
  
  app.get("/api/feedback/export", adminAuth, async (req, res) => {
    try {
      const allFeedback = await storage.getAllFeedback();
      
      if (allFeedback.length === 0) {
        return res.status(404).send('No feedback data available for export');
      }
      
      // Sort by date (most recent first)
      allFeedback.sort((a, b) => {
        const dateA = new Date(a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt || '');
        const dateB = new Date(b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt || '');
        return dateB.getTime() - dateA.getTime();
      });
      
      // Format satisfaction for display
      const formatSatisfaction = (sat: string) => {
        switch (sat) {
          case 'very_disappointed': return 'Very Disappointed';
          case 'somewhat_disappointed': return 'Somewhat Disappointed';
          case 'not_disappointed': return 'Not Disappointed';
          default: return sat;
        }
      };
      
      // Format date
      const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      };
      
      // Generate a simple HTML page with the data in a table format for easier viewing on mobile
      let htmlContent = `
        <html>
        <head>
          <title>Feedback Data - ${new Date().toISOString().split('T')[0]}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .export-info { margin-bottom: 20px; }
            h1 { color: #333; }
          </style>
        </head>
        <body>
          <h1>Feedback Data Export</h1>
          <div class="export-info">
            <p>Generated on: ${new Date().toLocaleString()}</p>
            <p>Total responses: ${allFeedback.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Satisfaction</th>
                <th>Main Benefit</th>
                <th>Improvements</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      // Add all feedback entries to the table
      allFeedback.forEach(entry => {
        htmlContent += `
          <tr>
            <td>${formatDate(entry.createdAt?.toString() || '')}</td>
            <td>${formatSatisfaction(entry.satisfaction)}</td>
            <td>${entry.mainBenefit || ''}</td>
            <td>${entry.improvements || ''}</td>
            <td>${entry.email || ''}</td>
          </tr>
        `;
      });
      
      // Close the HTML
      htmlContent += `
            </tbody>
          </table>
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      return res.send(htmlContent);
    } catch (error) {
      console.error("Error exporting feedback:", error);
      return res.status(500).json({
        message: error instanceof Error ? error.message : 'An unknown error occurred while exporting feedback'
      });
    }
  });

  // Watchlist endpoints (Task #14) ------------------------------------------
  app.get("/api/watchlist", async (req, res) => {
    try {
      const sessionId = getOrSetSessionId(req, res);
      const entries = await storage.listWatchlistEntries(sessionId);
      return res.json(entries.map(toWatchlistResponse));
    } catch (error) {
      console.error("Error listing watchlist entries:", error);
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to list watchlist entries",
      });
    }
  });

  app.post("/api/watchlist", async (req, res) => {
    try {
      const sessionId = getOrSetSessionId(req, res);
      const parsed = insertWatchlistEntrySchema.parse(req.body);
      const entry = await storage.addWatchlistEntry(
        sessionId,
        parsed.symbol,
        parsed.marginOfSafety,
      );
      return res.status(201).json(toWatchlistResponse(entry));
    } catch (error) {
      console.error("Error adding watchlist entry:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Invalid watchlist entry",
          details: error.errors,
        });
      }
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to add watchlist entry",
      });
    }
  });

  app.delete("/api/watchlist/:id", async (req, res) => {
    try {
      const sessionId = getOrSetSessionId(req, res);
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid watchlist entry id" });
      }
      const removed = await storage.removeWatchlistEntry(id, sessionId);
      if (!removed) {
        return res.status(404).json({ message: "Watchlist entry not found" });
      }
      return res.status(204).end();
    } catch (error) {
      console.error("Error removing watchlist entry:", error);
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to remove watchlist entry",
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
