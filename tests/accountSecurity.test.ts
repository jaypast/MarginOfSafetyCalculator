import { describe, expect, it } from "vitest";
import { normalizeAccountEvent, quoteCsvCell } from "../server/accountSecurity";

describe("account reporting input safety", () => {
  it("accepts known funnel events and strips user-supplied identifiers and free text", () => {
    expect(normalizeAccountEvent({
      eventName: "valuation_completed",
      properties: {
        method: "dcf",
        outcome: "undervalued",
        location: "calculator",
        email: "private@example.com",
        ticker: "ACME",
        note: "user content",
        accountId: 9,
      },
    })).toEqual({
      eventName: "valuation_completed",
      properties: { method: "dcf", outcome: "undervalued", location: "calculator" },
    });
  });

  it("rejects unknown event names and invalid dimensions", () => {
    expect(normalizeAccountEvent({ eventName: "arbitrary", properties: {} })).toBeNull();
    expect(normalizeAccountEvent({
      eventName: "stock_search_completed",
      properties: { source: "injected text", outcome: "success", location: "calculator" },
    })).toEqual({
      eventName: "stock_search_completed",
      properties: { outcome: "success", location: "calculator" },
    });
  });

  it("quotes CSV values and prevents spreadsheet formula execution", () => {
    expect(quoteCsvCell('=HYPERLINK("https://bad.example")')).toBe('"\'=HYPERLINK(""https://bad.example"")"');
    expect(quoteCsvCell('A "quote", here')).toBe('"A ""quote"", here"');
  });
});
