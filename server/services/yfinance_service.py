#!/usr/bin/env python3
import json
import sys
import yfinance as yf

def get_stock_data(symbol):
    """
    Fetch stock data using the yfinance package
    """
    try:
        # Get the ticker object
        ticker = yf.Ticker(symbol)
        
        # Get key information
        info = ticker.info
        
        # Fetch financial statements to get additional data if available
        try:
            financials = ticker.financials
            balance_sheet = ticker.balance_sheet
            cash_flow = ticker.cashflow
        except:
            # If financial statements can't be fetched, continue with basic info
            pass
        
        # Calculate or extract key metrics
        price = info.get('currentPrice', info.get('regularMarketPrice', 0))
        eps = info.get('trailingEps', 0)
        pe_ratio = info.get('trailingPE', info.get('forwardPE', 0))
        
        # Estimate FCF per share based on available data
        shares_outstanding = info.get('sharesOutstanding', 0)
        if shares_outstanding > 0:
            operating_cash_flow = info.get('operatingCashflow', 0)
            capital_expenditures = info.get('capitalExpenditures', 0)
            fcf_per_share = (operating_cash_flow - abs(capital_expenditures or 0)) / shares_outstanding
        else:
            fcf_per_share = eps * 0.8  # Estimate based on EPS
        
        # Determine growth rate from available metrics
        growth_rate = info.get('earningsGrowth', info.get('revenueGrowth', 0)) * 100
        if growth_rate == 0:
            # Use 5-year or forecasted growth if available
            growth_rate = info.get('fiveYearAvgDividendYield', 8)
        
        # Calculate ROE
        roe = info.get('returnOnEquity', 0.1) * 100
        
        # Get debt-to-equity ratio
        debt_to_equity = info.get('debtToEquity', 50) / 100 if info.get('debtToEquity') else 0.5
        
        # Get current ratio
        current_ratio = info.get('currentRatio', 1.5)
        
        # Get revenue growth
        revenue_growth = info.get('revenueGrowth', 0.05) * 100
        
        # Evaluate earnings stability based on beta and other factors
        beta = info.get('beta', 1)
        if beta < 0.8:
            earnings_stability = "High"
        elif beta < 1.2:
            earnings_stability = "Medium"
        else:
            earnings_stability = "Low"
        
        # Evaluate competitive position based on margins and market share
        profit_margin = info.get('profitMargins', 0)
        if profit_margin > 0.15 or info.get('grossMargins', 0) > 0.4:
            competitive_position = "Strong"
        elif profit_margin > 0.08 or info.get('grossMargins', 0) > 0.3:
            competitive_position = "Good"
        else:
            competitive_position = "Average"
        
        # Create a clean response object 
        response = {
            "symbol": symbol.upper(),
            "name": info.get('shortName', info.get('longName', symbol)),
            "price": price,
            "eps": eps,
            "peRatio": pe_ratio,
            "fcfPerShare": fcf_per_share,
            "growthRate": growth_rate,
            "roe": roe,
            "debtToEquity": debt_to_equity,
            "currentRatio": current_ratio,
            "revenueGrowth": revenue_growth,
            "earningsStability": earnings_stability,
            "competitivePosition": competitive_position
        }
        
        # Return as JSON string
        return json.dumps(response)
    
    except Exception as e:
        # Return error information
        return json.dumps({
            "error": str(e),
            "message": f"Failed to fetch data for {symbol}"
        })

# If the script is run directly
if __name__ == "__main__":
    # Check if a symbol was provided as a command line argument
    if len(sys.argv) > 1:
        symbol = sys.argv[1]
        result = get_stock_data(symbol)
        print(result)
    else:
        print(json.dumps({"error": "No symbol provided"}))