#!/usr/bin/env python3
import json
import sys
import yfinance as yf
import re

def get_stock_data(symbol):
    """
    Fetch stock data using the yfinance package
    Support for ticker symbols and European stocks
    """
    try:
        # For European stocks, add the exchange suffix if not already there
        # Common European exchanges: .L (London), .PA (Paris), .DE (Germany), etc.
        if not re.search(r'\.[A-Z]{1,4}$', symbol) and len(symbol) <= 5:
            # This could be a European stock without an exchange suffix
            # Let's keep the original symbol, the ticker constructor will try to find the right one
            pass
        
        # Get the ticker object
        ticker = yf.Ticker(symbol)
        
        # Validate ticker exists by checking if we can get basic info
        if not ticker.info or ticker.info.get('regularMarketPrice') is None:
            # Try with common European exchange suffixes
            european_exchanges = ['.L', '.PA', '.DE', '.MI', '.MC', '.AS', '.BR', '.CO', '.HE', '.I', '.OL', '.ST', '.SW', '.VI']
            for exchange in european_exchanges:
                try:
                    euro_ticker = yf.Ticker(f"{symbol}{exchange}")
                    if euro_ticker.info and euro_ticker.info.get('regularMarketPrice') is not None:
                        ticker = euro_ticker
                        symbol = f"{symbol}{exchange}"
                        print(f"Found European stock: {symbol}")
                        break
                except:
                    continue
                    
            # If no valid ticker found after trying European exchanges, raise an exception
            if not ticker.info or ticker.info.get('regularMarketPrice') is None:
                raise Exception(f"Could not find valid stock with symbol '{symbol}'.")
        
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

# Function to search for a company by name
def search_company_name(company_name):
    """
    Search for a company ticker by name using known large companies
    and a simple search through yfinance
    """
    # First, try a simple dictionary of common companies
    common_companies = {
        'apple': 'AAPL',
        'microsoft': 'MSFT',
        'amazon': 'AMZN',
        'google': 'GOOGL',
        'alphabet': 'GOOGL',
        'meta': 'META',
        'facebook': 'META',
        'tesla': 'TSLA',
        'nvidia': 'NVDA',
        'berkshire': 'BRK-B',
        'jpmorgan': 'JPM',
        'visa': 'V',
        'johnson': 'JNJ',
        'walmart': 'WMT',
        'procter': 'PG',
        'disney': 'DIS',
        'coca': 'KO',
        'bank of america': 'BAC',
        'home depot': 'HD',
        'netflix': 'NFLX',
        'adobe': 'ADBE',
        'paypal': 'PYPL',
        'salesforce': 'CRM',
        'siemens': 'SIEGY',
        'volkswagen': 'VWAGY',
        'bmw': 'BMWYY',
        'adidas': 'ADDYY',
        'deutsche bank': 'DB',
        'vodafone': 'VOD',
        'bp': 'BP',
        'shell': 'SHEL',
        'unilever': 'UL',
        'barclays': 'BCS',
        'hsbc': 'HSBC'
    }
    
    # Try to find a match in our dictionary
    company_lower = company_name.lower()
    for key, symbol in common_companies.items():
        if key in company_lower:
            return symbol
    
    # If no match in our dictionary, let's use the original input as the symbol
    # The ticker validation in the main function will check if it's valid
    # Remove common company suffixes and spaces for better matching
    clean_name = company_name.lower()
    for suffix in [' inc', ' corporation', ' corp', ' company', ' co', ' ltd', ' limited', ' plc', ' group']:
        clean_name = clean_name.replace(suffix, '')
    
    # Convert spaces to hyphens or dots to try as ticker (ex: "Coca Cola" -> "COCA-COLA" or "COCA.COLA")
    possible_ticker = clean_name.replace(' ', '-').upper()
    
    # Return the best guess, the validation in the main function will check if it exists
    return possible_ticker

# If the script is run directly
if __name__ == "__main__":
    # Check if a symbol was provided as a command line argument
    if len(sys.argv) > 1:
        symbol = sys.argv[1]
        result = get_stock_data(symbol)
        print(result)
    else:
        print(json.dumps({"error": "No symbol provided"}))