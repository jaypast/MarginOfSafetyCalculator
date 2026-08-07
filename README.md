# MarginOfSafetyCalculator

A small utility to estimate the intrinsic value of an investment and compute a margin of safety to help guide buy/sell decisions.

This README provides a general explanation of how the calculator works, the inputs it uses, and example usage. Adjust commands below to match the language and structure used in this repository.

## Concept

Margin of safety (MoS) is the difference between the intrinsic value of an asset and its current market price. A larger margin of safety provides a buffer against estimation error and unexpected downside.

Intrinsic value in this calculator is estimated by projecting a company's earnings (or cash flow) for a number of years, discounting those projected values back to present value using a discount rate, and adding a terminal value at the end of the projection horizon. The terminal value is commonly estimated with a Gordon Growth (perpetuity) model.

Formulas used (general):
- Project future earnings for years 1..N using the provided growth rate.
- Discount each year's projected earnings to present value: PV = FutureValue / (1 + r)^t where r is the discount rate and t is the year index.
- Estimate terminal value at year N: Terminal = Earnings_N * (1 + g) / (r - g) where g is the terminal (long-term) growth rate and r > g.
- Discount terminal value back to present value: PV_Terminal = Terminal / (1 + r)^N.
- Intrinsic value = Sum of discounted projected earnings + PV_Terminal.
- Margin of Safety (absolute) = Intrinsic Value - Market Price.
- Margin of Safety (%) = (Intrinsic Value - Market Price) / Intrinsic Value * 100%

Note: The exact implementation in code may use free cash flow, earnings, or another metric; check the code for the specific metric used in this repository.

## Inputs
Typical parameters the calculator accepts:
- current_price (market price per share)
- current_earnings (or free cash flow per share)
- growth_rate (annual projected growth for projection period, e.g., 0.05 for 5%)
- discount_rate (required rate of return, e.g., 0.10 for 10%)
- projection_years (N, e.g., 10)
- terminal_growth_rate (g, e.g., 0.02 for 2%)
- shares_outstanding (optional depending on implementation)
- margin_threshold (target margin of safety, e.g., 0.30 for 30%)

## How it works (step-by-step)
1. Take the current earnings (or cash flow) per share and apply the annual growth rate to project earnings for each year up to N.
2. For each projected year, discount the projected earnings back to the present using the discount rate.
3. Compute the terminal value at year N using a perpetuity formula (Gordon Growth) and discount it back.
4. Sum all discounted values to produce the intrinsic value per share.
5. Calculate margin of safety relative to the current market price.
6. Compare the calculated margin of safety to your margin_threshold to produce a recommendation (e.g., Buy if MoS >= threshold, Otherwise Hold/Sell).

## Example (pseudocode)

Inputs:
- current_price = 50.00
- current_earnings = 4.00
- growth_rate = 0.05 (5%)
- discount_rate = 0.10 (10%)
- projection_years = 10
- terminal_growth_rate = 0.02 (2%)

Steps:
- Project earnings for 10 years using growth_rate.
- Discount each year's earnings to present value and sum them.
- Compute terminal value using terminal_growth_rate and discount it.
- Intrinsic value per share ≈ sum of discounted earnings + discounted terminal value.
- Margin of safety (%) = (IntrinsicValue - current_price) / IntrinsicValue * 100

Interpretation:
- If MoS >= margin_threshold (for example 25–30%), the tool may mark this security as having a sufficient margin of safety.

## Running the project
Replace these commands with language- or repo-specific commands as needed.

- If this is a .NET project:
  - Install .NET SDK (see https://dotnet.microsoft.com/)
  - dotnet restore
  - dotnet run --project <path-to-project>

- If this is a Python project:
  - python -m venv venv
  - source venv/bin/activate  # or venv\Scripts\activate on Windows
  - pip install -r requirements.txt
  - python main.py --price 50 --earnings 4 --growth 0.05 --discount 0.10 --years 10 --terminal-growth 0.02

- If this is a command-line tool packaged differently, consult the repository code or update this README with exact commands.

## Examples and Tests
Add example input files or test cases to the repo to show typical calculations and expected outputs. Unit tests help ensure the implementation matches the formulas described above.

## Contributing
Contributions welcome. Please open an issue to discuss larger changes and submit pull requests for bug fixes or features. Include tests and update the README with any changes to inputs or formulas.

## License
Specify a license for this project (e.g., MIT). If you want me to add a LICENSE file, tell me which license to use and I can add it.

## Contact
Maintainer: @jaypast

---

If you want any adjustments (language-specific run instructions, concrete examples tied to the repository code, or a badge), tell me and I will update the README accordingly.