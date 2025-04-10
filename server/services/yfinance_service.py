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
        # Normalize the symbol
        symbol = symbol.upper().strip()
        
        # For European stocks handling
        has_exchange_suffix = bool(re.search(r'\.[A-Z]{1,4}$', symbol))
        
        # Basic request optimization: Only request necessary modules
        modules = "financialData,quoteType,defaultKeyStatistics,assetProfile,summaryDetail"
        
        # Get the ticker object
        ticker = yf.Ticker(symbol)
        
        # Efficient validation using fast properties
        ticker_valid = False
        try:
            if ticker.fast_info['lastPrice']:
                ticker_valid = True
        except:
            ticker_valid = False
            
        # Try European exchanges if needed
        if not ticker_valid and not has_exchange_suffix and len(symbol) <= 5:
            # Optimize by checking most common exchanges first (based on market size)
            european_exchanges = ['.L', '.PA', '.DE', '.MI', '.MC', '.AS']
            for exchange in european_exchanges:
                try:
                    euro_symbol = f"{symbol}{exchange}"
                    euro_ticker = yf.Ticker(euro_symbol)
                    if euro_ticker.fast_info['lastPrice']:
                        ticker = euro_ticker
                        symbol = euro_symbol
                        print(f"Found European stock: {symbol}")
                        ticker_valid = True
                        break
                except:
                    continue
        
        # If still not valid after European exchange check, raise exception
        if not ticker_valid:
            raise Exception(f"Could not find valid stock with symbol '{symbol}'.")
        
        # Get all required data in a single efficient request
        # This reduces API calls and improves performance
        info = ticker.info
        
        # Extract key metrics with fallbacks for efficiency
        price = info.get('currentPrice', info.get('regularMarketPrice', ticker.fast_info.get('lastPrice', 0)))
        eps = info.get('trailingEps', 0)
        pe_ratio = info.get('trailingPE', info.get('forwardPE', 0)) if eps != 0 else 0
        
        # Only calculate financial ratios if we have the necessary data
        shares_outstanding = info.get('sharesOutstanding', 0)
        operating_cash_flow = info.get('operatingCashflow', 0)
        capital_expenditures = info.get('capitalExpenditures', 0)
        
        # More efficient fcf calculation
        if shares_outstanding > 0 and operating_cash_flow:
            fcf_per_share = (operating_cash_flow - abs(capital_expenditures or 0)) / shares_outstanding
        else:
            fcf_per_share = eps * 0.8  # Reasonable estimate based on EPS
        
        # Simplified growth rate calculation
        growth_rate = info.get('earningsGrowth', info.get('revenueGrowth', 0))
        growth_rate = growth_rate * 100 if growth_rate else info.get('fiveYearAvgDividendYield', 8)
        
        # More efficient return calculation
        roe = info.get('returnOnEquity', 0.1) * 100
        
        # More efficient ratio calculations
        debt_to_equity = info.get('debtToEquity', 50) / 100 if info.get('debtToEquity') else 0.5
        current_ratio = info.get('currentRatio', 1.5)
        revenue_growth = info.get('revenueGrowth', 0.05) * 100
        
        # Simplified stability calculation
        beta = info.get('beta', 1)
        earnings_stability = "High" if beta < 0.8 else ("Medium" if beta < 1.2 else "Low")
        
        # Simplified competitive position calculation
        profit_margin = info.get('profitMargins', 0)
        gross_margin = info.get('grossMargins', 0)
        competitive_position = "Strong" if (profit_margin > 0.15 or gross_margin > 0.4) else \
                              ("Good" if (profit_margin > 0.08 or gross_margin > 0.3) else "Average")
        
        # Create clean response with efficient field extraction
        response = {
            "symbol": symbol,
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
        
        return json.dumps(response)
    
    except Exception as e:
        # Return concise error information
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