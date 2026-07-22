// Shared security-name filters for the Russell 3000 universe reconstruction.
//
// Used by BOTH the generation script (scripts/build-russell3000.ts) and the
// dataset integrity test (tests/russell3000.test.ts) so that non-common-stock
// instruments (notes, bonds, debentures, preferreds, closed-end funds, ETNs,
// warrants, rights, units, depositary shares) can never re-enter the dataset.
//
// History: the first generation pass used `\b(...% notes|due 20)\b`, whose
// word boundaries never matched real security names like
// "5.350% Global Notes due 2066" — ~85 debt/fund instruments slipped into the
// universe. These patterns are deliberately broad and individually tested.

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
  /\bETN\b/,
  /\bexchange[- ]traded\b/i,
  /\bperpetual\b/i,
  /\bcapital securities\b/i,
  /\btrust preferred\b/i,
];

/**
 * Returns true when a security name looks like a plain common stock /
 * ordinary share, i.e. it matches none of the exclusion patterns above.
 *
 * Note: plain "Trust" is intentionally allowed — REIT common shares
 * ("Diversified Healthcare Trust") are legitimate index constituents; their
 * exchange-listed baby bonds are caught by the notes/bonds patterns instead.
 */
export function isLikelyCommonStockName(name: string): boolean {
  return !EXCLUDED_SECURITY_NAME_PATTERNS.some((p) => p.test(name));
}

/** Valid ticker shape for the universe: 1–5 uppercase letters, no suffixes. */
export const VALID_SYMBOL_PATTERN = /^[A-Z]{1,5}$/;

/** Strips share-class boilerplate from a screener security name. */
export function cleanCompanyName(name: string): string {
  return name
    .replace(
      /\s+(Common Stock|Class [A-Z] Common Stock|Ordinary Shares|Common Shares)(\s.*)?$/,
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
