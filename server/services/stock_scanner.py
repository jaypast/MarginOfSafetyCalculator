#!/usr/bin/env python3
import json
import sys
import re
import datetime
from datetime import date, timedelta
import os
import time
import random
try:
    import yfinance as yf
    import pandas as pd
    import numpy as np
except ImportError:
    print("Warning: yfinance, pandas, or numpy module not found. Please install them using 'pip install yfinance pandas numpy'", file=sys.stderr)

# List of S&P 500 tickers
SP500_TICKERS = [
    'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'GOOG', 'TSLA', 'BRK-B', 'UNH',
    'LLY', 'JPM', 'V', 'XOM', 'AVGO', 'PG', 'MA', 'HD', 'CVX', 'MRK',
    'COST', 'ABBV', 'WMT', 'KO', 'PEP', 'ADBE', 'MCD', 'PFE', 'CRM', 'TMO',
    'CSCO', 'ACN', 'NFLX', 'ABT', 'AMD', 'BAC', 'ORCL', 'CMCSA', 'DIS', 'VZ',
    'INTC', 'INTU', 'IBM', 'CAT', 'AMGN', 'PM', 'NKE', 'TXN', 'GE', 'NEE',
    # Add more S&P 500 tickers as needed, these are the top 50
]

# Sample of Russell 2000 tickers (a few representatives)
RUSSELL2000_TICKERS = [
    'SRCE', 'SONA', 'FMNB', 'RDI', 'RMBI', 'RNST', 'RUTH', 'SAFT', 'SAIA', 'SAMG',
    'SANM', 'SASR', 'SBFG', 'SBRA', 'SCHL', 'SCHN', 'SCSC', 'SFIX', 'SFM', 'SGC',
    'SGMS', 'SHAK', 'SHEN', 'SHLS', 'SHOO', 'SHYF', 'SIBN', 'SIGA', 'SIGI', 'SITE',
    'SJW', 'SKY', 'SKYW', 'SLCA', 'SLGN', 'SLP', 'SMBC', 'SMCI', 'SMED', 'SMPL',
    'SNDX', 'SNR', 'SNSS', 'SOHO', 'SONO', 'SP', 'SPFI', 'SPNE', 'SPPI', 'SPRO',
    # Add more Russell 2000 tickers as needed, these are a sample of 50
]

# Function to evaluate stock and calculate margin of safety
def evaluate_stock(ticker_symbol):
    """
    Evaluate a stock and determine if it's undervalued
    Returns a dictionary with valuation metrics if undervalued, None otherwise
    """
    try:
        # Get ticker data
        ticker = yf.Ticker(ticker_symbol)
        
        # Check if ticker exists and has required data
        if not ticker.info or 'regularMarketPrice' not in ticker.info:
            print(f"Skipping {ticker_symbol}: Insufficient data", file=sys.stderr)
            return None
        
        # Get basic info
        info = ticker.info
        
        # Extract key metrics
        current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))
        name = info.get('shortName', info.get('longName', ticker_symbol))
        eps = info.get('trailingEps', 0)
        pe_ratio = info.get('trailingPE', info.get('forwardPE', 0))
        
        # Skip stocks with negative EPS
        if eps <= 0:
            print(f"Skipping {ticker_symbol}: Negative or zero EPS", file=sys.stderr)
            return None
        
        # Get other financial metrics
        shares_outstanding = info.get('sharesOutstanding', 0)
        operating_cash_flow = info.get('operatingCashflow', 0)
        capital_expenditures = abs(info.get('capitalExpenditures', 0))
        
        # If shares outstanding is available, calculate FCF per share
        if shares_outstanding > 0 and operating_cash_flow > 0:
            fcf_per_share = (operating_cash_flow - capital_expenditures) / shares_outstanding
        else:
            # Estimate FCF as a percentage of EPS
            fcf_per_share = eps * 0.8
        
        # Get growth rate from earnings growth or revenue growth
        growth_rate = info.get('earningsGrowth', info.get('revenueGrowth', 0))
        if growth_rate:
            growth_rate = growth_rate * 100  # Convert to percentage
        else:
            # Use average growth rate for industry if available
            growth_rate = 7  # Default conservative growth rate
        
        # Cap growth rate to reasonable levels
        growth_rate = min(growth_rate, 15)
        
        # Calculate intrinsic value using DCF
        discount_rate = 10  # 10% discount rate
        # Use a simplified DCF calculation
        terminal_multiple = 15  # Conservative terminal multiple
        
        # Calculate intrinsic value using DCF method
        projection_years = 5
        terminal_value = fcf_per_share * (1 + growth_rate/100)**projection_years * terminal_multiple
        present_value_factor = (1 + discount_rate/100)**projection_years
        intrinsic_value = fcf_per_share * ((1 - (1 + growth_rate/100)**projection_years / 
                                       (1 + discount_rate/100)**projection_years) / 
                                      (discount_rate/100 - growth_rate/100)) + terminal_value / present_value_factor
        
        # Calculate Graham Formula value
        graham_value = eps * (8.5 + 2 * min(growth_rate, 20))
        
        # Calculate PE-based value
        if pe_ratio > 0:
            pe_based_value = eps * min(pe_ratio, 20)  # Cap PE at 20 for conservative valuation
        else:
            pe_based_value = eps * 15  # Use average market PE if PE is unavailable
        
        # Calculate average intrinsic value from these methods
        average_value = (intrinsic_value + graham_value + pe_based_value) / 3
        
        # Apply margin of safety (30%)
        margin_of_safety = 0.3
        buy_below_price = average_value * (1 - margin_of_safety)
        
        # Calculate discount/premium percentage
        if average_value > 0:
            discount_premium = ((current_price - average_value) / average_value) * 100
        else:
            discount_premium = 0
            
        # Check if the stock is undervalued
        if current_price < buy_below_price and discount_premium < -15:
            # Determine quality based on financial stability metrics
            beta = info.get('beta', 1)
            debt_to_equity = info.get('debtToEquity', 50) / 100 if info.get('debtToEquity') else 0.5
            current_ratio = info.get('currentRatio', 1.5)
            profit_margin = info.get('profitMargins', 0) * 100 if info.get('profitMargins') else 0
            
            # Quality score (0-100)
            quality_score = 0
            
            # Beta factor (lower is better)
            if beta < 0.8:
                quality_score += 25
            elif beta < 1.2:
                quality_score += 15
            else:
                quality_score += 5
                
            # Debt to equity (lower is better)
            if debt_to_equity < 0.3:
                quality_score += 25
            elif debt_to_equity < 0.7:
                quality_score += 15
            elif debt_to_equity < 1.5:
                quality_score += 5
                
            # Current ratio (higher is better)
            if current_ratio > 2:
                quality_score += 25
            elif current_ratio > 1.5:
                quality_score += 15
            elif current_ratio > 1:
                quality_score += 5
                
            # Profit margin (higher is better)
            if profit_margin > 15:
                quality_score += 25
            elif profit_margin > 10:
                quality_score += 15
            elif profit_margin > 5:
                quality_score += 5
                
            # Determine quality category
            if quality_score >= 75:
                quality = "Exceptional"
            elif quality_score >= 50:
                quality = "Good"
            elif quality_score >= 25:
                quality = "Average"
            else:
                quality = "Speculative"
            
            # Return stock data with valuation metrics
            return {
                "symbol": ticker_symbol,
                "name": name,
                "price": current_price,
                "eps": eps,
                "fcf_per_share": fcf_per_share,
                "growth_rate": growth_rate,
                "intrinsic_value": average_value,
                "buy_below_price": buy_below_price,
                "discount_premium": discount_premium,
                "quality": quality,
                "quality_score": quality_score,
                "date_evaluated": datetime.datetime.now().strftime("%Y-%m-%d")
            }
        else:
            return None  # Not undervalued enough

    except Exception as e:
        print(f"Error evaluating {ticker_symbol}: {str(e)}", file=sys.stderr)
        return None

def scan_market_for_undervalued_stocks(max_stocks=80, delay=1):
    """
    Scan both S&P 500 and Russell 2000 stocks for undervalued stocks
    
    Args:
        max_stocks: Maximum number of stocks to process to avoid rate limiting
        delay: Delay between API calls in seconds to avoid rate limiting
    
    Returns:
        List of undervalued stocks with their valuation metrics
    """
    # Combine tickers from both indexes, prioritizing S&P 500
    combined_tickers = SP500_TICKERS + RUSSELL2000_TICKERS
    
    # Limit the number of stocks to process to avoid rate limiting
    tickers_to_process = combined_tickers[:max_stocks]
    
    undervalued_stocks = []
    processed_count = 0
    
    print(f"Starting market scan of {len(tickers_to_process)} stocks...", file=sys.stderr)
    
    for ticker in tickers_to_process:
        processed_count += 1
        
        # Add delay to avoid rate limiting
        if processed_count > 1:
            time.sleep(delay)
            
        print(f"Processing {ticker} ({processed_count}/{len(tickers_to_process)})", file=sys.stderr)
        
        # Evaluate the stock
        stock_data = evaluate_stock(ticker)
        
        # If undervalued, add to results
        if stock_data:
            undervalued_stocks.append(stock_data)
            print(f"Found undervalued stock: {ticker}", file=sys.stderr)
    
    # Sort undervalued stocks by discount percentage (highest discount first)
    undervalued_stocks.sort(key=lambda x: x["discount_premium"])
    
    print(f"Scan complete. Found {len(undervalued_stocks)} undervalued stocks.", file=sys.stderr)
    
    return undervalued_stocks

# Main execution
if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "scan"
    
    if command == "scan":
        # Determine max stocks to scan based on environment or command line args
        max_stocks = int(sys.argv[2]) if len(sys.argv) > 2 else 80
        
        # Scan for undervalued stocks
        undervalued_stocks = scan_market_for_undervalued_stocks(max_stocks=max_stocks)
        
        # Output as JSON
        print(json.dumps({"undervalued_stocks": undervalued_stocks}))
    else:
        print(json.dumps({"error": "Invalid command"}))