// Shared security filters for the Russell 3000 universe reconstruction.
//
// Used by BOTH the generation script (scripts/build-russell3000.ts) and the
// dataset integrity test (tests/russell3000.test.ts) so that non-common-stock
// instruments (notes, bonds, debentures, preferreds, closed-end funds, ETNs,
// warrants, rights, units, depositary shares, structured products, royalty
// trusts, limited partnerships) can never re-enter the dataset.
//
// History of misses these rules encode:
// - Pass 1 used `\b(...% notes|due 20)\b`, whose word boundaries never match
//   real names like "5.350% Global Notes due 2066" → ~85 debt instruments.
// - Pass 2 still admitted closed-end trusts ("Invesco Municipal Opportunity
//   Trust", "BlackRock ... Term Trust"), structured products (STRATS, ZONES),
//   royalty trusts, capital trusts, MLPs, and corporate-form CEFs
//   (Tri-Continental, General American Investors) whose names dodge every
//   keyword. Those are now caught by the trust/industry cross-check, the LP
//   patterns, and an explicit symbol denylist.

export const EXCLUDED_SECURITY_NAME_PATTERNS: RegExp[] = [
  /%/, // any coupon rate (e.g. "5.350% Global Notes") — debt or preferred
  /\bnotes?\b/i,
  /\bbonds?\b/i,
  /\bdebentures?\b/i,
  /\bsubordinated\b/i,
  /\bdue\b[\s\S]{0,40}?\b(19|20)\d{2}\b/i, // "due 2066", "due December 1 2077"
  /\bpreferred\b/i,
  /\bpreference\b/i,
  /\bdepositary\b/i,
  /\bwarrants?\b/i,
  /\brights?\b/i,
  /\bunits?\b/i,
  /\bfund\b/i, // closed-end funds ("PIMCO Dynamic Income Fund")
  /\bclosed[- ]end\b/i,
  /\bmunicipals?\b/i, // muni CEFs ("...Trust for Investment Grade New York Municipals")
  /\bterm trust\b/i, // dated CEFs ("BlackRock Science and Technology Term Trust")
  /\broyalty trust\b/i, // pass-through royalty vehicles (Permian Basin, Sabine)
  /\bcapital trust\b/i, // trust-preferred vehicles ("Dillard's Capital Trust I")
  /\btrust certificates?\b/i,
  /\bSTRATS\b/, // Structured Repackaged Asset-Backed Trust Securities
  /\bZONES\b/, // Zero-premium Option Notes (e.g. "Comcast Holdings ZONES")
  /\bSATURNS\b/,
  /\bCorTS\b/,
  /\bCABCO\b/,
  /\bPPLUS\b/,
  /\bstructured products?\b/i,
  /\bETN\b/,
  /\bexchange[- ]traded\b/i,
  /\bperpetual\b/i,
  /\bcapital securities\b/i,
  /\btrust preferred\b/i,
  // Limited partnerships (MLPs etc.) are not Russell constituents.
  /\bL\.P\.(\s|$)/,
  /\bLP\b/, // case-sensitive: "Hess Midstream LP", never ordinary words
  /\bLLLP\b/,
  /\blimited partnership\b/i,
];

// Nasdaq screener `industry` values that are never common operating
// companies. "Trusts Except Educational Religious and Charitable" is the
// screener's bucket for closed-end fund trusts — REIT common shares carry
// "Real Estate Investment Trusts" instead and remain eligible.
export const EXCLUDED_INDUSTRIES = new Set<string>([
  "Trusts Except Educational Religious and Charitable",
]);

// Closed-end funds also hide under generic finance industries with
// "...Trust" names ("Gabelli Dividend & Income Trust" → Investment Managers,
// "BlackRock Enhanced Equity Dividend Trust" → Finance Companies). Rule: a
// security whose NAME contains "Trust" is only a plausible common stock when
// its INDUSTRY is real-estate or banking. Everything else ("Oil & Gas
// Production" royalty trusts, retail capital trusts, all finance-industry
// CEF trusts) is excluded.
export const TRUST_NAME_ALLOWED_INDUSTRIES = new Set<string>([
  "Real Estate Investment Trusts",
  "Real Estate",
  "Building operators",
  "Major Banks",
  "Commercial Banks",
  "Savings Institutions",
]);

// Corporate-form closed-end funds whose names contain no fund/trust keyword
// at all (structured as ordinary corporations, still not index-eligible).
export const KNOWN_NON_CONSTITUENT_SYMBOLS = new Set<string>([
  "TY", // Tri-Continental Corporation
  "GAM", // General American Investors
  "CET", // Central Securities Corporation
  "SOR", // Source Capital
  "ASA", // ASA Gold and Precious Metals Limited
  "ADX", // Adams Diversified Equity
  "PEO", // Adams Natural Resources
  "USA", // Liberty All-Star Equity
  "ASG", // Liberty All-Star Growth
  "BIF", // Boulder Growth & Income
  "RVT", // Royce Value Trust
  "RMT", // Royce Micro-Cap Trust
  "GUT", // Gabelli Utility Trust
  "UTG", // Reaves Utility Income
  "BCV", // Bancroft Fund
  "ECF", // Ellsworth Growth and Income
  "MGF", // MFS Government Markets Income Trust
  "SRV", // NXG Cushing Midstream Energy
]);

/**
 * Returns true when a security name looks like a plain common stock /
 * ordinary share, i.e. it matches none of the exclusion patterns above.
 *
 * Note: plain "Trust" is intentionally allowed here — REIT common shares
 * ("Diversified Healthcare Trust", "Universal Health Realty Income Trust")
 * are legitimate constituents. Non-REIT "Trust" names are rejected by the
 * industry cross-check in isLikelyCommonStockRow.
 */
export function isLikelyCommonStockName(name: string): boolean {
  return !EXCLUDED_SECURITY_NAME_PATTERNS.some((p) => p.test(name));
}

/**
 * Row-level predicate for screener rows: name filters plus the industry
 * classification and symbol denylist (catches closed-end trusts and
 * corporate-form CEFs whose names dodge every keyword).
 */
export function isLikelyCommonStockRow(row: {
  symbol?: string | null;
  name: string;
  industry?: string | null;
}): boolean {
  if (row.symbol && KNOWN_NON_CONSTITUENT_SYMBOLS.has(row.symbol)) return false;
  if (row.industry && EXCLUDED_INDUSTRIES.has(row.industry)) return false;
  if (
    /\btrust\b/i.test(row.name) &&
    row.industry !== undefined &&
    row.industry !== null &&
    !TRUST_NAME_ALLOWED_INDUSTRIES.has(row.industry)
  ) {
    return false;
  }
  return isLikelyCommonStockName(row.name);
}

/** Valid ticker shape for the universe: 1–5 uppercase letters, no suffixes. */
export const VALID_SYMBOL_PATTERN = /^[A-Z]{1,5}$/;

/** Strips share-class boilerplate from a screener security name. */
export function cleanCompanyName(name: string): string {
  return name
    .replace(
      /\s+(Common Stock|Class [A-Z] Common Stock|Ordinary Shares|Common Shares|Common shares of beneficial interest|Common Shares of Beneficial Interest|Cmn Shs of BI)(\s.*)?$/i,
      "",
    )
    .replace(/\s+$/, "")
    .trim();
}

/**
 * Normalization key used to keep one share class per company
 * (mimics Russell's one-class rule).
 */
export function normalizeCompanyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(common stock|class [a-z]|series [a-z]|ordinary shares|american depositary shares).*$/g,
      "",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
