import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { stockResponseSchema, insertFeedbackSchema, insertUndervaluedReportSchema, insertUndervaluedStockSchema } from "@shared/schema";
import { getStockData } from "./services/stockData";
import { getMarketSentiment, getMostActiveStocks, RealTimeSentiment } from "./services/marketSentiment";
import { getHistoricalData } from "./services/yahooFinance";
import { ZodError } from "zod";
import { exec } from "child_process";
import path from "path";

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

  // Undervalued stocks reports API routes
  app.get("/api/undervalued/latest", async (req, res) => {
    try {
      const latestReport = await storage.getLatestUndervaluedReport();
      
      if (!latestReport) {
        return res.status(404).json({
          message: "No undervalued stocks report found"
        });
      }
      
      return res.json(latestReport);
    } catch (error) {
      console.error("Error fetching latest undervalued stocks report:", error);
      return res.status(500).json({
        message: error instanceof Error ? error.message : 'An unknown error occurred while fetching the latest report'
      });
    }
  });

  app.get("/api/undervalued/reports", async (req, res) => {
    try {
      const allReports = await storage.getAllUndervaluedReports();
      return res.json(allReports);
    } catch (error) {
      console.error("Error fetching undervalued stocks reports:", error);
      return res.status(500).json({
        message: error instanceof Error ? error.message : 'An unknown error occurred while fetching reports'
      });
    }
  });

  app.get("/api/undervalued/reports/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!id || isNaN(Number(id))) {
        return res.status(400).json({ message: 'Invalid report ID' });
      }
      
      const report = await storage.getUndervaluedReportById(Number(id));
      
      if (!report) {
        return res.status(404).json({
          message: `Report with ID ${id} not found`
        });
      }
      
      return res.json(report);
    } catch (error) {
      console.error("Error fetching undervalued stocks report:", error);
      return res.status(500).json({
        message: error instanceof Error ? error.message : 'An unknown error occurred while fetching the report'
      });
    }
  });

  // Run the stock scanner on demand
  app.post("/api/undervalued/scan", async (req, res) => {
    try {
      // Use import.meta.url to determine file path
      const currentModuleUrl = new URL(import.meta.url);
      const currentDir = path.dirname(currentModuleUrl.pathname);
      const scriptPath = path.join(currentDir, 'services', 'stock_scanner_improved.py');
      
      console.log(`Running improved stock scanner script: ${scriptPath}`);
      
      // Create a report entry first
      const reportData = {
        indexes: "S&P 500, Russell 2000",
        stocksCount: 0,
        isPending: true,
        reportDate: new Date(),
        notes: "Scanning stock market for undervalued opportunities..."
      };
      
      const newReport = await storage.createUndervaluedReport(reportData);
      
      // Execute the Python script
      exec(`python3 ${scriptPath} scan 50`, async (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing stock scanner: ${error.message}`);
          return;
        }
        
        try {
          if (stderr) {
            console.log(`Scanner stderr: ${stderr}`);
          }
          
          const scanResults = JSON.parse(stdout);
          const { undervalued_stocks } = scanResults;
          
          if (!undervalued_stocks || !Array.isArray(undervalued_stocks)) {
            console.error("Invalid scanner results format");
            return;
          }
          
          console.log(`Found ${undervalued_stocks.length} undervalued stocks`);
          
          // Update the existing report with the results
          try {
            // Create a new report with the same ID which will update the existing one
            const updatedReport = await storage.createUndervaluedReport({
              indexes: "S&P 500, Russell 2000",
              stocksCount: undervalued_stocks.length,
              isPending: false,
              notes: `Found ${undervalued_stocks.length} undervalued stocks`,
              reportDate: new Date()
            });
            
            console.log(`Created undervalued stocks report: ${JSON.stringify(updatedReport)}`);
          } catch (updateError) {
            console.error("Error updating report:", updateError);
            // Even if update fails, we'll continue adding the stocks
          }
          
          // Save each undervalued stock to the database
          for (const stock of undervalued_stocks) {
            const stockData = {
              symbol: stock.symbol,
              name: stock.name,
              price: stock.price,
              eps: stock.eps,
              fcfPerShare: stock.fcf_per_share,
              growthRate: stock.growth_rate,
              intrinsicValue: stock.intrinsic_value,
              buyBelowPrice: stock.buy_below_price,
              discountPremium: stock.discount_premium,
              quality: stock.quality,
              qualityScore: stock.quality_score,
              dateEvaluated: new Date(stock.date_evaluated),
              reportId: newReport.id
            };
            
            await storage.createUndervaluedStock(stockData);
          }
          
          console.log(`Undervalued stocks (${undervalued_stocks.length}) saved to database for report ID: ${newReport.id}`);
        } catch (err) {
          console.error("Error processing scanner results:", err);
        }
      });
      
      // Return immediately without waiting for the script to complete
      return res.status(202).json({
        message: "Stock scan initiated",
        reportId: newReport.id
      });
    } catch (error) {
      console.error("Error initiating stock scan:", error);
      return res.status(500).json({
        message: error instanceof Error ? error.message : 'An unknown error occurred while initiating the scan'
      });
    }
  });

  // Export undervalued stocks report as HTML
  app.get("/api/undervalued/reports/:id/export", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!id || isNaN(Number(id))) {
        return res.status(400).json({ message: 'Invalid report ID' });
      }
      
      const report = await storage.getUndervaluedReportById(Number(id));
      
      if (!report) {
        return res.status(404).json({
          message: `Report with ID ${id} not found`
        });
      }
      
      if (report.stocks.length === 0) {
        return res.status(404).send('No stocks in this report');
      }
      
      // Format date
      const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      };
      
      // Format price
      const formatPrice = (price: number) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(price);
      };
      
      // Format percentage
      const formatPercentage = (value: number) => {
        return new Intl.NumberFormat('en-US', {
          style: 'percent',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1
        }).format(value / 100);
      };
      
      // Generate a simple HTML page with the data in a table format
      let htmlContent = `
        <html>
        <head>
          <title>Undervalued Stocks Report - ${formatDate(report.reportDate)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .report-info { margin-bottom: 20px; }
            h1 { color: #333; }
            .disclaimer { color: #777; font-style: italic; margin-top: 20px; }
            .exceptional { color: #22c55e; }
            .good { color: #3b82f6; }
            .average { color: #f97316; }
            .speculative { color: #ef4444; }
          </style>
        </head>
        <body>
          <h1>Undervalued Stocks Report</h1>
          <div class="report-info">
            <p>Report Date: ${formatDate(report.reportDate)}</p>
            <p>Indexes: ${report.indexes}</p>
            <p>Total Undervalued Stocks: ${report.stocksCount}</p>
          </div>
          
          <p>This report contains stocks that appear undervalued based on various valuation metrics including DCF analysis, 
          Graham Formula, and PE-based valuations. Stocks are sorted by largest discount to intrinsic value.</p>
          
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Company</th>
                <th>Current Price</th>
                <th>Intrinsic Value</th>
                <th>Buy Below</th>
                <th>Discount</th>
                <th>Quality</th>
                <th>EPS</th>
                <th>FCF/Share</th>
                <th>Growth Rate</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      // Add all stocks to the table
      report.stocks.forEach(stock => {
        const qualityClass = stock.quality.toLowerCase();
        htmlContent += `
          <tr>
            <td>${stock.symbol}</td>
            <td>${stock.name}</td>
            <td>${formatPrice(stock.price)}</td>
            <td>${formatPrice(stock.intrinsic_value)}</td>
            <td>${formatPrice(stock.buy_below_price)}</td>
            <td>${formatPercentage(stock.discount_premium * -1)}</td>
            <td class="${qualityClass}">${stock.quality}</td>
            <td>${formatPrice(stock.eps)}</td>
            <td>${formatPrice(stock.fcf_per_share)}</td>
            <td>${stock.growth_rate.toFixed(1)}%</td>
          </tr>
        `;
      });
      
      // Close the HTML
      htmlContent += `
            </tbody>
          </table>
          
          <div class="disclaimer">
            <p><strong>Disclaimer:</strong> This report is for research purposes only and does not constitute investment advice. 
            All valuations are estimates based on publicly available data and should be used as just one of many inputs 
            in your investment decision process. Always do your own research before making any investment decisions.</p>
          </div>
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      return res.send(htmlContent);
    } catch (error) {
      console.error("Error exporting undervalued stocks report:", error);
      return res.status(500).json({
        message: error instanceof Error ? error.message : 'An unknown error occurred while exporting report'
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
