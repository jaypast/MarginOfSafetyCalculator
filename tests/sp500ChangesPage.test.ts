// @vitest-environment happy-dom

import React, { type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("../client/src/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("../client/src/lib/analytics", () => ({
  trackEvent: mocks.trackEvent,
}));

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    React.createElement("a", { ...props, href }, children),
}));

import Sp500Changes from "../client/src/pages/Sp500Changes";

const makeResponse = (quality: string | null) => ({
  quarters: [
    {
      quarter: "2026 Q3",
      changes: [
        {
          id: 1,
          effectiveDate: "2026-09-01",
          announcementDate: null,
          changeType: "addition" as const,
          symbol: "ACME",
          companyName: "Acme Corporation",
          membershipSource: "test",
          snapshot: {
            status: "complete" as const,
            evaluatedAt: "2026-09-01T12:00:00.000Z",
            price: 100,
            intrinsicValue: 140,
            discountPct: 28.6,
            marginOfSafetyPct: 28.6,
            quality,
            meetsBuyCriteria: false,
            reason: "Test snapshot",
            dataSource: "test",
            fetchedAt: null,
            dataWarnings: [],
          },
          evaluationRevision: {
            calculationVersion: 4,
            revised: false,
            originalEvaluatedAt: "2026-09-01T12:00:00.000Z",
          },
        },
      ],
    },
  ],
  lastCheckedAt: null,
  update: { newCount: 0, checked: false },
});

describe("S&P 500 changes quality presentation", () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderPage = async () => {
    await act(async () => {
      root.render(React.createElement(Sp500Changes));
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => makeResponse("Speculative"),
      }),
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    vi.unstubAllGlobals();
    mocks.toast.mockReset();
    mocks.trackEvent.mockReset();
  });

  it("displays the legacy snapshot label as Caution", async () => {
    await renderPage();

    expect(container.textContent).toContain("Caution");
    expect(container.textContent).not.toContain("Speculative");
  });

  it("displays unknown snapshot quality as Unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => makeResponse("Future quality"),
      }),
    );

    await renderPage();

    expect(container.textContent).toContain("Unavailable");
    expect(container.textContent).not.toContain("Future quality");
  });
});