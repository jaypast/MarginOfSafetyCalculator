#!/usr/bin/env python3
"""
Undervalued Stock Scanner

This script scans the S&P 500 and Russell 2000 indexes for undervalued stocks
based on multiple valuation methods including DCF, Graham Formula, and P/E ratio.
It returns a list of stocks that meet the criteria for being undervalued.

Usage:
  python stock_scanner.py scan [max_stocks]
  python stock_scanner.py evaluate [ticker]

Arguments:
  scan: Scan the market for undervalued stocks
  evaluate: Evaluate a single stock by ticker symbol
  max_stocks: Maximum number of stocks to scan (default: 50)
"""

import sys
import json
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime

# Constants for valuation
RISK_FREE_RATE = 0.045  # 4.5% (10-year Treasury yield)
MARKET_RETURN = 0.10    # 10% (historical market return)
MIN_MARGIN_OF_SAFETY = 0.20  # 20% minimum margin of safety

def evaluate_stock(ticker_symbol):
    """
    Evaluate a stock and determine if it's undervalued
    Returns a dictionary with valuation metrics if undervalued, None otherwise
    """
    try:
        # Get stock data
        stock = yf.Ticker(ticker_symbol)
        info = stock.info
        
        # Basic company information
        symbol = ticker_symbol
        name = info.get('longName', info.get('shortName', ticker_symbol))
        current_price = info.get('currentPrice', info.get('regularMarketPrice', 0))
        
        if not current_price or current_price == 0:
            return None
            
        # Get financial metrics
        try:
            # EPS (Trailing Twelve Months)
            eps_ttm = info.get('trailingEPS', 0)
            if not eps_ttm or eps_ttm <= 0:
                eps_ttm = 0
            
            # P/E Ratio
            pe_ratio = info.get('trailingPE', 0)
            if not pe_ratio or pe_ratio <= 0:
                pe_ratio = current_price / eps_ttm if eps_ttm > 0 else 30  # Default to 30 if can't calculate
            
            # Growth Rate (use analysts' estimate or historical growth)
            growth_rate = info.get('earningsGrowth', 0)
            if not growth_rate or growth_rate <= 0:
                growth_rate = info.get('revenueGrowth', 0.05)  # Default to 5% if no data available
                
            if growth_rate > 0.30:  # Cap growth rate at 30%
                growth_rate = 0.30
            
            # Free Cash Flow per Share
            try:
                # Get latest annual financials to calculate FCF
                financials = stock.financials
                cash_flow = stock.cashflow
                
                if not financials.empty and not cash_flow.empty:
                    # Operating Cash Flow (most recent year)
                    operating_cash_flow = cash_flow.loc['Total Cash From Operating Activities'].iloc[0]
                    
                    # Capital Expenditures (most recent year)
                    capital_expenditures = cash_flow.loc['Capital Expenditures'].iloc[0] if 'Capital Expenditures' in cash_flow.index else 0
                    
                    # Free Cash Flow
                    fcf = operating_cash_flow - abs(capital_expenditures)
                    
                    # Shares Outstanding
                    shares_outstanding = info.get('sharesOutstanding', 0)
                    
                    # Free Cash Flow per Share
                    fcf_per_share = fcf / shares_outstanding if shares_outstanding > 0 else 0
                else:
                    fcf_per_share = 0
            except Exception as e:
                # If error in calculating FCF, use an estimate based on EPS
                fcf_per_share = eps_ttm * 0.8  # Rough estimate: FCF is approximately 80% of EPS
            
            # Calculate quality score (0-100)
            quality_score = 0
            
            # Profitability metrics
            roe = info.get('returnOnEquity', 0) * 100 if info.get('returnOnEquity') else 0
            if roe > 15:
                quality_score += 20
            elif roe > 10:
                quality_score += 15
            elif roe > 5:
                quality_score += 5
                
            # Balance sheet health
            debt_equity = info.get('debtToEquity', 0) / 100 if info.get('debtToEquity') else 2
            if debt_equity < 0.3:
                quality_score += 20
            elif debt_equity < 0.5:
                quality_score += 15
            elif debt_equity < 1:
                quality_score += 10
            elif debt_equity < 1.5:
                quality_score += 5
                
            # Growth metrics
            if growth_rate > 0.15:  # 15% growth
                quality_score += 20
            elif growth_rate > 0.10:  # 10% growth
                quality_score += 15
            elif growth_rate > 0.05:  # 5% growth
                quality_score += 10
            elif growth_rate > 0:
                quality_score += 5
                
            # Market position and stability
            if info.get('marketCap', 0) > 10e9:  # Large cap (>$10B)
                quality_score += 10
            elif info.get('marketCap', 0) > 2e9:  # Mid cap (>$2B)
                quality_score += 8
            elif info.get('marketCap', 0) > 300e6:  # Small cap (>$300M)
                quality_score += 5
                
            # Profit margins
            profit_margin = info.get('profitMargins', 0) if info.get('profitMargins') else 0
            if profit_margin > 0.20:  # 20% profit margin
                quality_score += 15
            elif profit_margin > 0.15:  # 15% profit margin
                quality_score += 12
            elif profit_margin > 0.10:  # 10% profit margin
                quality_score += 8
            elif profit_margin > 0.05:  # 5% profit margin
                quality_score += 5
                
            # Dividend history
            if info.get('dividendYield', 0) > 0 and info.get('payoutRatio', 0) < 0.7:
                quality_score += 15
            
            # Determine quality category
            quality = "Speculative"  # Default
            if quality_score >= 75:
                quality = "Exceptional"
            elif quality_score >= 60:
                quality = "Good"
            elif quality_score >= 40:
                quality = "Average"
            
            # Calculate intrinsic value using multiple methods
            
            # 1. DCF Method (simplified)
            discount_rate = RISK_FREE_RATE + 0.05  # Risk-free rate + 5% risk premium
            
            # For simplicity, assume current FCF grows at the expected growth rate for 10 years
            # then at 3% terminal growth rate thereafter
            if fcf_per_share > 0 and growth_rate > 0:
                dcf_value = 0
                terminal_growth = 0.03  # 3% terminal growth rate
                
                # Sum of 10 years of discounted FCF
                for year in range(1, 11):
                    projected_fcf = fcf_per_share * ((1 + growth_rate) ** year)
                    dcf_value += projected_fcf / ((1 + discount_rate) ** year)
                
                # Terminal value (Gordon Growth Model)
                terminal_fcf = fcf_per_share * ((1 + growth_rate) ** 10) * (1 + terminal_growth)
                terminal_value = terminal_fcf / (discount_rate - terminal_growth)
                discounted_terminal_value = terminal_value / ((1 + discount_rate) ** 10)
                
                dcf_value += discounted_terminal_value
            else:
                # If FCF is negative or zero, fall back to PE-based valuation
                dcf_value = eps_ttm * 15  # Assume 15x PE ratio as a baseline
            
            # 2. Graham Formula (Revised)
            # Graham number: √(22.5 * EPS * Book Value per Share)
            # Revised formula: (8.5 + 2g) * EPS, where g is growth rate as percentage
            book_value_per_share = info.get('bookValue', 0)
            
            if eps_ttm > 0:
                graham_number = np.sqrt(22.5 * eps_ttm * book_value_per_share) if book_value_per_share > 0 else 0
                graham_formula = (8.5 + (2 * (growth_rate * 100))) * eps_ttm
                graham_value = max(graham_number, graham_formula)
            else:
                graham_value = 0
            
            # 3. PE-based valuation
            # Use industry average PE or a PE based on growth rate
            industry_pe = info.get('trailingPE', 15)
            if industry_pe <= 0 or industry_pe > 50:
                industry_pe = 15  # Default to 15 if not available or unreasonable
            
            growth_based_pe = 15 * (1 + growth_rate)  # Higher growth justifies higher PE
            reasonable_pe = min(max(10, growth_based_pe), 25)  # Bound between 10 and 25
            
            pe_value = eps_ttm * reasonable_pe if eps_ttm > 0 else 0
            
            # Weighted average intrinsic value
            if fcf_per_share > 0 and eps_ttm > 0:
                intrinsic_value = (dcf_value * 0.5) + (graham_value * 0.3) + (pe_value * 0.2)
            elif eps_ttm > 0:
                intrinsic_value = (graham_value * 0.6) + (pe_value * 0.4)
            else:
                intrinsic_value = dcf_value
            
            # Calculate margin of safety required based on company quality
            if quality == "Exceptional":
                required_margin = 0.10  # 10% for high quality companies
            elif quality == "Good":
                required_margin = 0.20  # 20% for good companies
            elif quality == "Average":
                required_margin = 0.30  # 30% for average companies
            else:
                required_margin = 0.50  # 50% for speculative companies
            
            # Calculate buy below price
            buy_below_price = intrinsic_value * (1 - required_margin)
            
            # Calculate current discount/premium
            discount_premium = ((current_price / intrinsic_value) - 1) if intrinsic_value > 0 else 1
            
            # Check if stock is undervalued
            is_undervalued = current_price < buy_below_price
            
            # Return stock data with valuation metrics
            stock_data = {
                "symbol": symbol,
                "name": name,
                "price": current_price,
                "eps": eps_ttm,
                "fcf_per_share": fcf_per_share,
                "growth_rate": growth_rate,
                "intrinsic_value": intrinsic_value,
                "buy_below_price": buy_below_price,
                "discount_premium": discount_premium,
                "quality": quality,
                "quality_score": quality_score,
                "is_undervalued": is_undervalued,
                "date_evaluated": datetime.now().isoformat()
            }
            
            return stock_data
        
        except Exception as e:
            print(f"Error evaluating financial metrics for {ticker_symbol}: {str(e)}", file=sys.stderr)
            return None
    
    except Exception as e:
        print(f"Error fetching data for {ticker_symbol}: {str(e)}", file=sys.stderr)
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
    try:
        # Get S&P 500 constituents
        sp500 = pd.read_html('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies')[0]
        sp500_tickers = sp500['Symbol'].tolist()
        
        # Get Russell 2000 constituents (approximation using ETF holdings)
        # For a real implementation, you might need a paid data source
        russell2000_ticker = "IWM"  # iShares Russell 2000 ETF
        russell2000_etf = yf.Ticker(russell2000_ticker)
        
        try:
            # Try to get holdings directly
            holdings = russell2000_etf.get_holdings()
            russell2000_tickers = holdings.index.tolist() if not holdings.empty else []
        except:
            # Fallback to hardcoded sample of Russell 2000 stocks
            russell2000_tickers = [
                "CRNC", "HALO", "CROX", "HAYW", "OLPX", "GPRE", "MORF", "MNDY", "AZTA", 
                "PRVA", "ACHC", "MTDR", "STAA", "ASO", "DUOL", "OLN", "EBC", "CBRL", 
                "ARWR", "ASGN", "CNXC", "CWH", "CASY", "AVAV", "QDEL", "SAIA", "PLNT", 
                "CNX", "PGNY", "OLED", "XPER", "AMKR", "QLYS", "NTNX", "MOD", "DBRG", 
                "SONO", "TEN", "SBOW", "EVOP", "NFE", "HURN", "USNA", "AVIR", "CLBK"
            ]
        
        # Combine and limit to max_stocks
        all_tickers = list(set(sp500_tickers + russell2000_tickers))[:max_stocks]
        
        # Evaluate each stock
        undervalued_stocks = []
        
        print(f"Scanning {len(all_tickers)} stocks for undervalued opportunities...", file=sys.stderr)
        
        for i, ticker in enumerate(all_tickers):
            try:
                # Clean ticker symbol
                ticker = ticker.replace(".", "-")  # Convert BRK.B to BRK-B for Yahoo Finance
                
                stock_data = evaluate_stock(ticker)
                
                if stock_data and stock_data["is_undervalued"]:
                    # Only keep stocks with at least 10% discount to intrinsic value
                    if stock_data["discount_premium"] <= -0.10:
                        undervalued_stocks.append(stock_data)
                        print(f"Found undervalued stock: {ticker}", file=sys.stderr)
            except Exception as e:
                print(f"Error processing {ticker}: {str(e)}", file=sys.stderr)
        
        # Sort by discount to intrinsic value (ascending order - bigger discounts first)
        undervalued_stocks.sort(key=lambda x: x["discount_premium"])
        
        print(f"Found {len(undervalued_stocks)} undervalued stocks", file=sys.stderr)
        
        return {
            "scan_date": datetime.now().isoformat(),
            "stocks_scanned": len(all_tickers),
            "undervalued_count": len(undervalued_stocks),
            "undervalued_stocks": undervalued_stocks
        }
    
    except Exception as e:
        print(f"Error scanning market: {str(e)}", file=sys.stderr)
        return {
            "scan_date": datetime.now().isoformat(),
            "error": str(e),
            "undervalued_stocks": []
        }


if __name__ == "__main__":
    # Process command line arguments
    if len(sys.argv) < 2:
        print("Usage: python stock_scanner.py [scan|evaluate] [ticker|max_stocks]", file=sys.stderr)
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == "scan":
        # Default to 50 stocks if not specified
        max_stocks = int(sys.argv[2]) if len(sys.argv) > 2 else 50
        result = scan_market_for_undervalued_stocks(max_stocks)
        print(json.dumps(result))
    
    elif command == "evaluate":
        if len(sys.argv) < 3:
            print("Please provide a ticker symbol to evaluate", file=sys.stderr)
            sys.exit(1)
        
        ticker = sys.argv[2].upper()
        result = evaluate_stock(ticker)
        
        if result:
            print(json.dumps(result))
        else:
            print(json.dumps({"error": f"Could not evaluate {ticker}"}))
    
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        print("Usage: python stock_scanner.py [scan|evaluate] [ticker|max_stocks]", file=sys.stderr)
        sys.exit(1)