// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedResearchData,
  getCacheExpirationDate,
  getCacheLastUpdated,
} from "../client/src/lib/researchCache";

const CACHE_KEY = "research_data_cache_v4";
const TIMESTAMP_KEY = "research_data_timestamp_v4";

const stock = {
  symbol: "ACME",
  name: "Acme Corporation",
  price: 100,
  intrinsicValue: 140,
  discount: 28.6,
  quality: "Speculative",
};

describe("research cache quality compatibility", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(CACHE_KEY, JSON.stringify([stock]));
    localStorage.setItem(TIMESTAMP_KEY, Date.now().toString());
  });

  it("translates a legacy cached quality label before returning research data", () => {
    expect(getCachedResearchData()).toEqual({
      data: [{ ...stock, quality: "Caution" }],
      needsRefresh: false,
    });
  });

  it("invalidates cached research data when the quality value is unknown", () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify([{ ...stock, quality: "Not a real quality" }]),
    );

    expect(getCachedResearchData()).toEqual({
      data: null,
      needsRefresh: true,
    });
  });
});