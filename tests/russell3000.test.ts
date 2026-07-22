import { describe, expect, it } from "vitest";
import {
  RUSSELL_3000,
  RUSSELL_3000_AS_OF,
} from "../server/data/russell3000";
import {
  EXCLUDED_SECURITY_NAME_PATTERNS,
  KNOWN_NON_CONSTITUENT_SYMBOLS,
  VALID_SYMBOL_PATTERN,
  cleanCompanyName,
  isLikelyCommonStockName,
  isLikelyCommonStockRow,
  normalizeCompanyKey,
} from "../server/data/universeFilters";

// Names that slipped through earlier filter passes. These are real security
// names from the Nasdaq screener; none may ever classify as common stock.
const KNOWN_BAD_NAMES = [
  // Pass-1 misses: the `\bdue 20\b` word-boundary bug
  "AT&T Inc. 5.350% Global Notes due 2066",
  "Southern Company (The) Series 2020C 4.20% Junior Subordinated Notes due October 15 2060",
  "Algonquin Power & Utilities Corp. 6.20% Fixed-to-Floating Subordinated Notes Series 2019-A due July 1 2079",
  "Duke Energy Corporation 5.625% Junior Subordinated Debentures due 2078",
  "Entergy New Orleans LLC First Mortgage Bonds 5.0% Series due December 1 2052",
  "Liberty Latin America Ltd. 9.0% Fixed Rate Cumulative Perpetual Redeemable Series A Preference Shares",
  "PIMCO Dynamic Income Fund",
  "Nuveen New York Quality Municipal Income Fund",
  "Cohen & Steers Closed-End Opportunity Fund Inc.",
  "Guggenheim Taxable Municipal Bond & Investment Grade Debt Trust",
  "DTE Energy Company 2021 Series E 4.375% Junior Subordinated Debentures",
  "Bank of America Corporation Depositary Shares",
  "Acme Acquisition Corp. Warrants",
  "Acme Acquisition Corp. Units",
  "Acme Acquisition Corp. Rights",
  "iPath Series B S&P 500 VIX Short-Term Futures ETN",
  // Pass-2 misses: structured products, muni CEFs, royalty/capital trusts, LPs
  "Comcast Holdings ZONES",
  "Goldman Sachs Group Securities STRATS Trust for Goldman Sachs Group Securities Series 2006-2",
  "Invesco Municipal Opportunity Trust Common Stock",
  "Invesco Trust for Investment Grade New York Municipals",
  "BlackRock Science and Technology Term Trust Common Shares of Beneficial Interest",
  "Permian Basin Royalty Trust",
  "Sabine Royalty Trust",
  "Dillard's Capital Trust I",
  "Enterprise Products Partners L.P.",
  "Hess Midstream LP Class A Representing Limited Partner Interests",
  "Natural Resource Partners LP Limited Partnership",
];

// Exchange-listed debt / CEFs / structured products / royalty trusts / LPs /
// corporate-form CEFs that earlier generations shipped. They must never
// reappear regardless of how names evolve.
const KNOWN_BAD_SYMBOLS = [
  // pass 1: exchange-listed debt
  "TBB", "SOJC", "SOJD", "SOJE", "AQNB", "DUKB", "APOS", "KKRS", "SREA",
  "ENJ", "EMP", "EAI", "PRH", "PRS", "CMSD", "CMSC", "CMSA", "PFH", "DTW",
  "PDI", "NAN", "NCV", "NCZ", "NIE", "FOF", "ETB", "GBAB", "MIN", "MMT",
  "MFM", "FMN", "MGR", "MGRB", "MGRD", "MGRE", "JSM", "SFB", "GPJA",
  // pass 2: structured products, CEF trusts, royalty trusts, capital trusts
  "CCZ", "GJS", "VMO", "BSTZ", "OIA", "GDV", "BDJ", "GAB", "BKT", "BTZ",
  "BST", "TBLD", "RMT", "XFLT", "BLW", "PPT", "EFT", "FTF", "VTN", "GRX",
  "PIM", "GNT", "JHS", "PBT", "SBR", "MSB", "DDT", "FUND",
  // pass 2: limited partnerships (MLPs)
  "EPD", "IEP", "HESM", "NRP", "SPH", "SGU",
  // pass 2: corporate-form closed-end funds
  "TY", "GAM", "CET", "SOR", "ASA",
];

// Legitimate common stocks whose names contain trigger-adjacent words —
// the filter must NOT reject these.
const KNOWN_GOOD_NAMES = [
  "Apple Inc.",
  "Johnson & Johnson",
  "Diversified Healthcare Trust", // REIT common shares — "Trust" alone is fine
  "Universal Health Realty Income Trust", // REIT — "Income Trust" must survive
  "Coca-Cola Company (The)",
  "Unum Group",
  "United Airlines Holdings Inc.",
  "Brighthouse Financial Inc.",
  "Prudential Financial Inc.",
  "NextEra Energy Inc.",
  "Alexandria Real Estate Equities Inc.",
];

describe("universe filters (server/data/universeFilters.ts)", () => {
  it("rejects every known-bad security name", () => {
    for (const name of KNOWN_BAD_NAMES) {
      expect(isLikelyCommonStockName(name), `should reject: ${name}`).toBe(false);
    }
  });

  it("accepts legitimate common-stock names", () => {
    for (const name of KNOWN_GOOD_NAMES) {
      expect(isLikelyCommonStockName(name), `should accept: ${name}`).toBe(true);
    }
  });

  it("catches the original word-boundary bug case (due 2066 with no space before the century)", () => {
    // The buggy first-pass pattern was /\bdue 20\b/ which never matched.
    expect(isLikelyCommonStockName("Example Corp 5% Senior Debt due 2066")).toBe(false);
    expect(isLikelyCommonStockName("Issuer LLC Mortgage Instruments due December 1 2052")).toBe(false);
  });

  it("row check rejects Trust-named securities outside real-estate/banking industries", () => {
    // Closed-end fund trusts hiding under generic finance industries
    expect(
      isLikelyCommonStockRow({ name: "Gabelli Dividend & Income Trust", industry: "Investment Managers" }),
    ).toBe(false);
    expect(
      isLikelyCommonStockRow({ name: "Blackrock Enhanced Equity Dividend Trust", industry: "Finance Companies" }),
    ).toBe(false);
    expect(
      isLikelyCommonStockRow({ name: "Blackrock Limited Duration Income Trust", industry: "Other Consumer Services" }),
    ).toBe(false);
    // Royalty trusts under commodity industries
    expect(
      isLikelyCommonStockRow({ name: "Mesabi Trust", industry: "Precious Metals" }),
    ).toBe(false);
  });

  it("row check keeps Trust-named REITs and trust banks", () => {
    expect(
      isLikelyCommonStockRow({ name: "Universal Health Realty Income Trust", industry: "Real Estate Investment Trusts" }),
    ).toBe(true);
    expect(
      isLikelyCommonStockRow({ name: "Northern Trust Corporation", industry: "Major Banks" }),
    ).toBe(true);
    expect(
      isLikelyCommonStockRow({ name: "Claros Mortgage Trust Inc.", industry: "Real Estate" }),
    ).toBe(true);
  });

  it("row check rejects the screener's closed-end-trust industry bucket", () => {
    expect(
      isLikelyCommonStockRow({
        name: "Some Innocuously Named Vehicle",
        industry: "Trusts Except Educational Religious and Charitable",
      }),
    ).toBe(false);
  });

  it("row check rejects corporate-form CEFs via the symbol denylist", () => {
    expect(
      isLikelyCommonStockRow({ symbol: "TY", name: "Tri Continental Corporation", industry: "Finance/Investors Services" }),
    ).toBe(false);
    expect(KNOWN_NON_CONSTITUENT_SYMBOLS.has("GAM")).toBe(true);
  });

  it("rejects limited partnerships by name", () => {
    expect(isLikelyCommonStockName("Suburban Propane Partners L.P.")).toBe(false);
    expect(isLikelyCommonStockName("Star Group L.P.")).toBe(false);
    expect(isLikelyCommonStockName("Icahn Enterprises L.P.")).toBe(false);
    // ...but not ordinary words containing "lp" lowercase
    expect(isLikelyCommonStockName("Alpine Income Property Trust Inc.")).toBe(true);
    expect(isLikelyCommonStockName("Helmerich & Payne Inc.")).toBe(true);
  });

  it("cleanCompanyName strips share-class boilerplate", () => {
    expect(cleanCompanyName("Apple Inc. Common Stock")).toBe("Apple Inc.");
    expect(cleanCompanyName("Alphabet Inc. Class A Common Stock")).toBe("Alphabet Inc.");
    expect(cleanCompanyName("Sea Limited Ordinary Shares")).toBe("Sea Limited");
    expect(cleanCompanyName("Office Properties Income Trust Common shares of beneficial interest")).toBe(
      "Office Properties Income Trust",
    );
  });

  it("normalizeCompanyKey collapses share classes to one key", () => {
    expect(normalizeCompanyKey("Alphabet Inc. Class A Common Stock")).toBe(
      normalizeCompanyKey("Alphabet Inc. Class C Capital Stock"),
    );
  });
});

describe("Russell 3000 dataset integrity (server/data/russell3000.ts)", () => {
  it("has exactly 3000 constituents", () => {
    expect(RUSSELL_3000).toHaveLength(3000);
  });

  it("has a plausible as-of date", () => {
    expect(RUSSELL_3000_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has unique symbols", () => {
    const symbols = new Set(RUSSELL_3000.map((e) => e.symbol));
    expect(symbols.size).toBe(RUSSELL_3000.length);
  });

  it("every symbol is 1-5 uppercase letters (no suffixed instruments)", () => {
    const offenders = RUSSELL_3000.filter((e) => !VALID_SYMBOL_PATTERN.test(e.symbol));
    expect(offenders.map((e) => e.symbol)).toEqual([]);
  });

  it("contains no notes, bonds, debentures, preferreds, funds, ETNs, warrants, rights, units, depositary shares, structured products, royalty trusts, or LPs", () => {
    const offenders = RUSSELL_3000.filter((e) => !isLikelyCommonStockName(e.name));
    expect(
      offenders.map((e) => `${e.symbol}: ${e.name}`),
      "non-common-stock instruments found in the universe",
    ).toEqual([]);
  });

  it("contains none of the non-constituent symbols earlier generations shipped", () => {
    const symbols = new Set(RUSSELL_3000.map((e) => e.symbol));
    const present = KNOWN_BAD_SYMBOLS.filter((s) => symbols.has(s));
    expect(present).toEqual([]);
  });

  it("contains none of the denylisted corporate-form CEF symbols", () => {
    const symbols = new Set(RUSSELL_3000.map((e) => e.symbol));
    const present = [...KNOWN_NON_CONSTITUENT_SYMBOLS].filter((s) => symbols.has(s));
    expect(present).toEqual([]);
  });

  it("keeps one share class per company", () => {
    const keys = new Map<string, string>();
    const dupes: string[] = [];
    for (const e of RUSSELL_3000) {
      const key = normalizeCompanyKey(e.name);
      if (!key) continue;
      const prior = keys.get(key);
      if (prior) dupes.push(`${prior} / ${e.symbol} (${e.name})`);
      else keys.set(key, e.symbol);
    }
    expect(dupes).toEqual([]);
  });

  it("still contains obvious mega-cap anchors", () => {
    const symbols = new Set(RUSSELL_3000.map((e) => e.symbol));
    for (const anchor of ["AAPL", "MSFT", "NVDA", "AMZN", "JPM", "JNJ", "XOM"]) {
      expect(symbols.has(anchor), `missing anchor ${anchor}`).toBe(true);
    }
  });

  it("exclusion pattern list is intact (guards accidental deletion)", () => {
    expect(EXCLUDED_SECURITY_NAME_PATTERNS.length).toBeGreaterThanOrEqual(25);
  });
});
