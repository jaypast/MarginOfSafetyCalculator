import * as cron from 'node-cron';
import { exec } from 'child_process';
import path from 'path';
import { storage } from '../storage';

/**
 * Schedule a monthly scan for undervalued stocks
 * This will run on the 1st day of each month at 1:00 AM
 */
export function scheduleUndervaluedStockScan() {
  console.log('Setting up monthly undervalued stocks scan schedule');
  
  // Schedule the task to run on the 1st day of every month at 1:00 AM
  // Cron format: second minute hour day month day-of-week
  cron.schedule('0 1 1 * *', async () => {
    try {
      console.log('Starting scheduled monthly scan for undervalued stocks');
      
      // Create a report entry first
      const reportData = {
        indexes: "S&P 500, Russell 2000",
        stocksCount: 0,
        isPending: true,
        reportDate: new Date(),
        notes: "Monthly scheduled scan for undervalued stocks"
      };
      
      const newReport = await storage.createUndervaluedReport(reportData);
      
      // Path to the Python script
      const scriptPath = path.join(__dirname, 'stock_scanner.py');
      
      // Execute the Python script with a limit of 80 stocks
      exec(`python3 ${scriptPath} scan 80`, async (error, stdout, stderr) => {
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
          
          console.log(`Monthly scan found ${undervalued_stocks.length} undervalued stocks`);
          
          // Update the report with the actual stock count
          const updatedReport = {
            ...newReport,
            stocksCount: undervalued_stocks.length,
            isPending: false,
            notes: `Monthly scan found ${undervalued_stocks.length} undervalued stocks`
          };
          
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
          
          console.log("Monthly scan completed successfully");
        } catch (err) {
          console.error("Error processing monthly scanner results:", err);
        }
      });
      
    } catch (error) {
      console.error('Error running scheduled undervalued stocks scan:', error);
    }
  }, {
    scheduled: true,
    timezone: "America/New_York" // Set to appropriate timezone
  });
  
  console.log('Monthly undervalued stocks scan scheduled successfully');
}