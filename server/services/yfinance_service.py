#!/usr/bin/env python3
import json
import sys
import yfinance as yf
import re

def get_stock_data(symbol):
    """
    Fetch stock data using the yfinance package
    Support for ticker symbols in multiple markets:
    - US markets (e.g., AAPL, MSFT)
    - European markets (e.g., BP.L, AIR.PA)
    - Japanese markets (e.g., 7203.T, 9984.T)
    - Hong Kong markets (e.g., 0700.HK, 9988.HK)
    - Other Asian markets (.SS, .SZ, .KS, .TW)
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
            # Try with common exchange suffixes (European, Asian, etc.)
            exchanges = {
                # European exchanges
                '.L': 'London',
                '.PA': 'Paris',
                '.DE': 'Germany',
                '.MI': 'Milan',
                '.MC': 'Madrid',
                '.AS': 'Amsterdam',
                '.BR': 'Brussels',
                '.CO': 'Copenhagen',
                '.HE': 'Helsinki',
                '.I': 'Ireland',
                '.OL': 'Oslo',
                '.ST': 'Stockholm',
                '.SW': 'Switzerland',
                '.VI': 'Vienna',
                # Asian exchanges
                '.T': 'Tokyo',
                '.HK': 'Hong Kong',
                '.SS': 'Shanghai',
                '.SZ': 'Shenzhen',
                '.KS': 'Seoul',
                '.TW': 'Taiwan'
            }
            
            for exchange_suffix, exchange_name in exchanges.items():
                try:
                    exchange_ticker = yf.Ticker(f"{symbol}{exchange_suffix}")
                    if exchange_ticker.info and exchange_ticker.info.get('regularMarketPrice') is not None:
                        ticker = exchange_ticker
                        symbol = f"{symbol}{exchange_suffix}"
                        print(f"Found {exchange_name} stock: {symbol}")
                        break
                except:
                    continue
                    
            # If no valid ticker found after trying all exchanges, raise an exception
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
        
        # Handle currency conversions for non-USD stocks
        currency = info.get('currency', 'USD')
        rate = 1.0  # Default rate (1:1 for USD)
        
        if currency != 'USD':
            try:
                # Get conversion rate if available (for major currencies)
                currency_pair = f"{currency}USD=X"
                conversion_ticker = yf.Ticker(currency_pair)
                conversion_data = conversion_ticker.history(period="1d")
                
                if not conversion_data.empty:
                    rate = conversion_data['Close'].iloc[-1]
                    print(f"Converting from {currency} to USD with rate: {rate}")
                    
                    # Convert price and EPS to USD
                    price = price * rate
                    eps = eps * rate
            except:
                # If conversion fails, use a fallback method
                print(f"Could not convert {currency} to USD, using estimates")
                
                # Rough conversion estimates for common currencies
                conversion_rates = {
                    'HKD': 0.13,  # Hong Kong Dollar to USD
                    'JPY': 0.0067,  # Japanese Yen to USD
                    'EUR': 1.08,  # Euro to USD
                    'GBP': 1.25,  # British Pound to USD
                    'CNY': 0.14,  # Chinese Yuan to USD
                    'CAD': 0.73,  # Canadian Dollar to USD
                    'AUD': 0.66,  # Australian Dollar to USD
                }
                
                if currency in conversion_rates:
                    rate = conversion_rates[currency]
                    price = price * rate
                    eps = eps * rate
                    print(f"Using estimated {currency} to USD rate: {rate}")
                else:
                    # If no conversion rate available, use 1.0 as fallback
                    print(f"No conversion rate available for {currency}, using 1.0")
        
        # Estimate FCF per share based on available data
        shares_outstanding = info.get('sharesOutstanding', 0)
        if shares_outstanding > 0:
            operating_cash_flow = info.get('operatingCashflow', 0)
            capital_expenditures = info.get('capitalExpenditures', 0)
            
            # Apply currency conversion to cash flow if already converted price
            if currency != 'USD' and 'rate' in locals():
                operating_cash_flow = operating_cash_flow * rate
                capital_expenditures = capital_expenditures * rate
                
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
        name = info.get('shortName', info.get('longName', symbol))
        
        # Fix company names for dual-listed stocks
        # Map of stock symbol patterns to cleaner names
        name_corrections = {
            '9988.HK': 'Alibaba Group Holding Limited',
            'BABA': 'Alibaba Group Holding Limited',
            '0700.HK': 'Tencent Holdings Limited',
            'TCEHY': 'Tencent Holdings Limited',
            '3690.HK': 'Meituan',
            'MPNGF': 'Meituan'
        }
        
        # Check if we have a name correction for this symbol
        if symbol.upper() in name_corrections:
            name = name_corrections[symbol.upper()]
            
        response = {
            "symbol": symbol.upper(),
            "name": name,
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
        # US companies
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
        
        # European companies
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
        'hsbc': 'HSBC',
        
        # Japanese companies
        'toyota': '7203.T',
        'softbank': '9984.T',
        'sony': '6758.T',
        'honda': '7267.T',
        'mitsubishi': '8058.T',
        'nintendo': '7974.T',
        'panasonic': '6752.T',
        'mizuho': '8411.T',
        'nomura': '8604.T',
        
        # Hong Kong companies
        'tencent': '0700.HK',
        'alibaba': '9988.HK',
        'xiaomi': '1810.HK',
        'meituan': '3690.HK',
        'jd': '9618.HK',
        'ping an': '2318.HK',
        'china mobile': '0941.HK',
        'bank of china': '3988.HK'
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