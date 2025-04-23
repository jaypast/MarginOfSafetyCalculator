import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { stockResponseSchema, insertFeedbackSchema } from "@shared/schema";
import { getStockData } from "./services/stockData";
import { getMarketSentiment, getMostActiveStocks, RealTimeSentiment } from "./services/marketSentiment";
import { getHistoricalData } from "./services/yahooFinance";
import { ZodError } from "zod";

// Cache for sentiment data to prevent excessive API calls
let sentimentCache: {
  data: RealTimeSentiment[];
  timestamp: number;
} | null = null;

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

export async function registerRoutes(app: Express): Promise<Server> {
  // Historical data route - must be defined before the general stock route
  app.get('/api/stock/:symbol/history', async (req, res) => {
    try {
      const { symbol } = req.params;
      const { period = '5y', interval = '1mo' } = req.query;
      
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ message: 'Invalid stock symbol' });
      }
      
      const historicalData = await getHistoricalData(
        symbol.toUpperCase(), 
        typeof period === 'string' ? period : '5y',
        typeof interval === 'string' ? interval : '1mo'
      );
      
      return res.json(historicalData);
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
  
  app.get("/api/feedback/stats", async (req, res) => {
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
  
  app.get("/api/feedback", async (req, res) => {
    try {
      const allFeedback = await storage.getAllFeedback();
      return res.json(allFeedback);
    } catch (error) {
      console.error("Error getting feedback:", error);
      return res.status(500).json({
        message: error instanceof Error ? error.message : 'An unknown error occurred while fetching feedback'
      });
    }
  });
  
  app.get("/api/feedback/export", async (req, res) => {
    try {
      const allFeedback = await storage.getAllFeedback();
      
      if (allFeedback.length === 0) {
        return res.status(404).send('No feedback data available for export');
      }
      
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

  const httpServer = createServer(app);

  return httpServer;
}
