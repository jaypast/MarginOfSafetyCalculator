import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const KNOWN_ROUTES = new Set(["/", "/watchlist", "/research", "/feedback", "/admin"]);

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function getBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const deployed = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (deployed) return `https://${deployed}`;
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}`;
  return "https://margin-of-safety.replit.app";
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface RouteMeta {
  title: string;
  description: string;
  jsonLd: object;
  bodyHtml: string;
}

const NAV_HTML = `
<nav style="background:#1A2942;color:white;padding:1rem 1.5rem">
  <div style="max-width:1200px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
    <a href="/" style="color:white;font-size:1.2rem;font-weight:bold;text-decoration:none">Margin of Safety Calculator</a>
    <div style="display:flex;gap:1.5rem">
      <a href="/" style="color:white;text-decoration:none">Home</a>
      <a href="/watchlist" style="color:white;text-decoration:none">Watchlist</a>
      <a href="/research" style="color:white;text-decoration:none">Research</a>
      <a href="/feedback" style="color:white;text-decoration:none">Feedback</a>
    </div>
  </div>
</nav>`.trim();

const CONTENT_STYLE = `style="max-width:900px;margin:2rem auto;padding:0 1.5rem;font-family:sans-serif;color:#1A2942"`;

function buildRouteMeta(baseUrl: string): Record<string, RouteMeta> {
  return {
    "/": {
      title: "Margin of Safety Calculator — Stock Intrinsic Value Tool",
      description:
        "Estimate the intrinsic value of any stock using DCF, P/E, and Graham methods, then calculate a buy-below price with a configurable margin of safety.",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Margin of Safety Calculator",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        description:
          "Estimate the intrinsic value of any stock using DCF, P/E, and Graham methods, then calculate a buy-below price with a configurable margin of safety.",
        url: baseUrl,
        featureList: [
          "Discounted Cash Flow (DCF) valuation",
          "P/E-based intrinsic value with historical and industry multiples",
          "Benjamin Graham formula valuation",
          "Configurable margin of safety from 10% to 50%",
          "Value-investor verdict using Graham, Klarman, and Munger principles",
          "Multibagger factor screener based on Yartseva 2025 research",
          "Persistent watchlist with per-ticker score tracking",
          "Fed rate environment macro badge",
        ],
        publisher: { "@type": "Organization", name: "Margin of Safety Calculator" },
      },
      bodyHtml: `${NAV_HTML}
<main ${CONTENT_STYLE}>
  <h1 style="font-size:2rem;margin-bottom:.5rem">Margin of Safety Calculator</h1>
  <p style="font-size:1.1rem;color:#415876;margin-bottom:1.5rem">Calculate intrinsic value and determine buy-below thresholds following Benjamin Graham's principles.</p>
  <section style="margin-bottom:2rem">
    <h2 style="font-size:1.25rem;margin-bottom:.75rem">Three valuation methods</h2>
    <ul style="line-height:2;padding-left:1.25rem">
      <li><strong>Discounted Cash Flow (DCF)</strong> — projects free cash flow and discounts to present value using a configurable discount rate and terminal multiple.</li>
      <li><strong>P/E-Based</strong> — derives value from earnings per share and a historical or industry P/E multiple (current, 5-year, 10-year, or industry baseline).</li>
      <li><strong>Graham Formula</strong> — applies Benjamin Graham's classic <em>Intrinsic Value = EPS × (8.5 + 2g)</em> with an optional base adjustment.</li>
    </ul>
  </section>
  <section style="margin-bottom:2rem">
    <h2 style="font-size:1.25rem;margin-bottom:.75rem">Margin of Safety</h2>
    <p>Set a required margin of safety from 10% to 50%. The calculator derives a buy-below price for each method — protecting against estimation error and market volatility in the tradition of Seth Klarman's <em>Margin of Safety</em>.</p>
  </section>
  <section>
    <h2 style="font-size:1.25rem;margin-bottom:.75rem">Value-investor verdict &amp; multibagger screener</h2>
    <p>Each ticker is evaluated against a Graham / Klarman / Munger scorecard and scored on the five factor exposures empirically associated with 10x returns (Yartseva 2025): free cash flow yield, size, profitability, investment affordability, and 52-week range entry.</p>
  </section>
</main>`,
    },

    "/research": {
      title: "Research & Stock Screener — Margin of Safety Calculator",
      description:
        "Screen stocks for value-investing signals, generate a Russell 3000 valuation report, and explore research resources for disciplined investors.",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Research & Stock Screener",
        description:
          "Screen stocks for value-investing signals and generate comprehensive Russell 3000 valuation reports.",
        url: `${baseUrl}/research`,
        isPartOf: { "@type": "WebSite", name: "Margin of Safety Calculator", url: baseUrl },
      },
      bodyHtml: `${NAV_HTML}
<main ${CONTENT_STYLE}>
  <h1 style="font-size:2rem;margin-bottom:.5rem">Research &amp; Stock Screener</h1>
  <p style="font-size:1.1rem;color:#415876;margin-bottom:1.5rem">Screen the Russell 3000 for value-investing opportunities and generate comprehensive valuation reports.</p>
  <section style="margin-bottom:2rem">
    <h2 style="font-size:1.25rem;margin-bottom:.75rem">Russell 3000 valuation report</h2>
    <p>Request a full scan of approximately 3,000 US common stocks. Each ticker is evaluated for intrinsic value, margin of safety, data quality, and multibagger factor scores. Results are delivered by email as a downloadable CSV.</p>
  </section>
  <section style="margin-bottom:2rem">
    <h2 style="font-size:1.25rem;margin-bottom:.75rem">What the report includes</h2>
    <ul style="line-height:2;padding-left:1.25rem">
      <li>Ticker, company name, current price, and data source</li>
      <li>DCF, P/E, and Graham intrinsic value estimates</li>
      <li>Margin of safety and buy-below price per method</li>
      <li>Company quality classification and value-investor verdict</li>
      <li>Multibagger composite score (FCF yield, size, profitability, affordability, range entry)</li>
    </ul>
  </section>
  <section>
    <h2 style="font-size:1.25rem;margin-bottom:.75rem">Educational resources</h2>
    <p>Curated reading guides covering intrinsic value, Seth Klarman's principles, valuation method comparisons, quality assessment, multibagger characteristics, and why earnings growth is a poor predictor of long-run returns.</p>
  </section>
</main>`,
    },

    "/watchlist": {
      title: "Watchlist — Margin of Safety Calculator",
      description:
        "Track your shortlisted stocks, compare intrinsic value estimates, and monitor multibagger factor scores in one place.",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Watchlist",
        description: "Track shortlisted stocks and monitor multibagger factor scores.",
        url: `${baseUrl}/watchlist`,
        isPartOf: { "@type": "WebSite", name: "Margin of Safety Calculator", url: baseUrl },
      },
      bodyHtml: `${NAV_HTML}
<main ${CONTENT_STYLE}>
  <h1 style="font-size:2rem;margin-bottom:.5rem">Watchlist</h1>
  <p style="font-size:1.1rem;color:#415876;margin-bottom:1.5rem">Track stocks you are monitoring and compare their intrinsic value estimates side by side.</p>
  <section style="margin-bottom:2rem">
    <h2 style="font-size:1.25rem;margin-bottom:.75rem">Persistent tracking</h2>
    <p>Stocks added to the watchlist are stored in your browser and persist across sessions. For each entry the watchlist shows the current price, intrinsic value, margin of safety, company quality, value-investor verdict, and multibagger composite score.</p>
  </section>
  <section>
    <h2 style="font-size:1.25rem;margin-bottom:.75rem">Sort by multibagger score</h2>
    <p>Rank your watchlist by the five-factor composite score derived from the Yartseva 2025 panel study of 464 US multibaggers — free cash flow yield, market capitalisation, return on assets, investment affordability, and 52-week range entry point.</p>
  </section>
</main>`,
    },

    "/feedback": {
      title: "Feedback — Margin of Safety Calculator",
      description:
        "Share your experience with the Margin of Safety Calculator. Help us improve valuation accuracy, data sources, and investor tools.",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Feedback",
        description: "Share feedback to help improve the Margin of Safety Calculator.",
        url: `${baseUrl}/feedback`,
        isPartOf: { "@type": "WebSite", name: "Margin of Safety Calculator", url: baseUrl },
      },
      bodyHtml: `${NAV_HTML}
<main ${CONTENT_STYLE}>
  <h1 style="font-size:2rem;margin-bottom:.5rem">Feedback</h1>
  <p style="font-size:1.1rem;color:#415876;margin-bottom:1.5rem">Help us improve the Margin of Safety Calculator.</p>
  <section>
    <p>We track product-market fit using Sean Ellis's "very disappointed" benchmark. Your responses help prioritise improvements to valuation accuracy, data-source coverage, and the investor tools we build next.</p>
  </section>
</main>`,
    },

    "/admin": {
      title: "Admin — Margin of Safety Calculator",
      description: "Administration panel for the Margin of Safety Calculator.",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Admin",
        url: `${baseUrl}/admin`,
      },
      bodyHtml: `${NAV_HTML}
<main ${CONTENT_STYLE}>
  <h1 style="font-size:2rem;margin-bottom:.5rem">Admin</h1>
</main>`,
    },
  };
}

function injectRouteMeta(html: string, pathname: string): string {
  const baseUrl = getBaseUrl();
  const routeMeta = buildRouteMeta(baseUrl);
  const meta = routeMeta[pathname] ?? routeMeta["/"];
  const canonicalPath = pathname === "/" ? "" : pathname;
  const canonicalUrl = `${baseUrl}${canonicalPath}`;
  const ogImage = `${baseUrl}/favicon.png`;

  const headTags = `<title>${escapeAttr(meta.title)}</title>
    <meta name="description" content="${escapeAttr(meta.description)}" />
    <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeAttr(meta.title)}" />
    <meta property="og:description" content="${escapeAttr(meta.description)}" />
    <meta property="og:url" content="${escapeAttr(canonicalUrl)}" />
    <meta property="og:image" content="${escapeAttr(ogImage)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeAttr(meta.title)}" />
    <meta name="twitter:description" content="${escapeAttr(meta.description)}" />
    <script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>`;

  const withHead = html.replace(/<title>[^<]*<\/title>/, headTags);

  const withBody = withHead.replace(
    '<div id="root"></div>',
    `<div id="root">${meta.bodyHtml}</div>`,
  );

  return withBody;
}

let cachedStaticHtml: string | null = null;

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    const pathname = url.split("?")[0].replace(/\/$/, "") || "/";
    const isKnownRoute = KNOWN_ROUTES.has(pathname);

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      template = injectRouteMeta(template, pathname);
      const page = await vite.transformIndexHtml(url, template);
      res.status(isKnownRoute ? 200 : 404).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist, with correct status
  app.use("*", (req, res) => {
    const pathname = req.originalUrl.split("?")[0].replace(/\/$/, "") || "/";
    const status = KNOWN_ROUTES.has(pathname) ? 200 : 404;

    try {
      if (!cachedStaticHtml) {
        cachedStaticHtml = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");
      }
      const page = injectRouteMeta(cachedStaticHtml, pathname);
      res.status(status).set({ "Content-Type": "text/html" }).end(page);
    } catch {
      res.status(status).sendFile(path.resolve(distPath, "index.html"));
    }
  });
}
