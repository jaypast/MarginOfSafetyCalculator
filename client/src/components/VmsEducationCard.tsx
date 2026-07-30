/**
 * VmsEducationCard — expandable educational panel explaining VMS
 * (Vertical Market Software) business characteristics and their
 * relationship to valuation confidence.
 *
 * Shown when VMS score ≥ 50 OR when a sector warning is present.
 * Pure static text — no data fetching.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';

interface VmsEducationCardProps {
  /** The stock's VMS score (0–100) */
  vmsScore: number;
  /** Whether a sector warning (amber or green) is currently showing */
  hasSectorWarning: boolean;
}

const VmsEducationCard: React.FC<VmsEducationCardProps> = ({ vmsScore, hasSectorWarning }) => {
  const [open, setOpen] = useState(false);

  // Only render when the score is meaningful or a sector warning is active
  if (vmsScore < 50 && !hasSectorWarning) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-start justify-between w-full p-4 text-left hover:bg-neutral-50 rounded-lg transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          <BookOpen className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-semibold text-[#1A2942]">
              Why business model matters for valuation
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              How VMS characteristics affect DCF reliability · Constellation Software's insight
            </p>
          </div>
        </div>
        <div className="rounded-full bg-neutral-100 p-1 ml-3 shrink-0 mt-0.5">
          {open
            ? <ChevronUp className="h-4 w-4 text-neutral-500" />
            : <ChevronDown className="h-4 w-4 text-neutral-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-neutral-100 p-4 space-y-4 text-sm text-neutral-700">

          {/* Section 1: What is a VMS business */}
          <div>
            <h3 className="font-semibold text-[#1A2942] mb-2">What makes a VMS business</h3>
            <p className="mb-2">
              Vertical Market Software (VMS) businesses sell mission-critical software to a single
              niche — funeral homes, marina operators, transit agencies, municipal permit offices.
              Their defining traits:
            </p>
            <ul className="list-disc list-inside space-y-1 text-neutral-600">
              <li>
                <strong>Near-zero customer churn.</strong> The software is deeply embedded in
                daily operations; customers train staff around it and almost never leave.
                Retention rates of 90%+ are typical.
              </li>
              <li>
                <strong>No natural disruptor.</strong> The niche is too small for Microsoft,
                Salesforce, or any hyperscaler to justify attacking. The market battle is already over.
              </li>
              <li>
                <strong>High gross margins.</strong> Software has near-zero marginal cost, so
                incremental revenue flows almost entirely to profit.
              </li>
              <li>
                <strong>Moderate, stable growth.</strong> 5–15%/yr is the sweet spot —
                mature enough to be predictable, still compounding.
              </li>
            </ul>
          </div>

          {/* Section 2: Why it matters for valuation */}
          <div>
            <h3 className="font-semibold text-[#1A2942] mb-2">How this improves DCF reliability</h3>
            <p className="mb-2">
              A DCF model is only as reliable as the cash flows being discounted.
              For most businesses, predicting FCF 10 years out is genuinely uncertain —
              competition, technology shifts, and economic cycles all introduce wide error bands.
            </p>
            <p className="mb-2">
              VMS businesses are different. Because customers almost never leave and the
              competitive position is structurally protected, the next 10 years of cash flows
              look much like the last 10. That makes terminal value assumptions much less
              sensitive to small changes in your growth rate or discount rate inputs.
            </p>
            <p>
              In practice: the same DCF model that can be off by 50% for a platform-tech company
              may be accurate to within 15% for a well-run VMS business. The margin of safety
              required is correspondingly lower.
            </p>
          </div>

          {/* Section 3: Constellation Software */}
          <div>
            <h3 className="font-semibold text-[#1A2942] mb-2">Constellation Software's playbook</h3>
            <p className="mb-2">
              Mark Leonard (Constellation Software, CSU.TO) has compounded shareholder value at
              ~30%/yr since 1995 by systematically acquiring VMS businesses. His insight:
            </p>
            <blockquote className="border-l-4 border-blue-200 pl-3 italic text-neutral-600 my-2">
              "We seek out vertical market software businesses where the competitive battle is
              already won — the market is too small for a platform giant to care about, yet
              large enough to sustain a durable business."
            </blockquote>
            <p className="text-neutral-600 text-xs mt-2">
              Constellation measures acquisition success using IRR hurdle rates (targeting 15–25%)
              rather than P/E or revenue multiples, because predictable FCF is exactly what
              makes the IRR calculation trustworthy for this type of business.
            </p>
          </div>

          {/* Section 4: Limitations */}
          <div className="bg-neutral-50 rounded-md p-3 text-xs text-neutral-600">
            <strong className="text-neutral-700">Note on VMS scoring:</strong> This app estimates
            VMS-like characteristics from publicly available financial data — gross margins,
            operating margins, FCF stability, debt levels, and revenue growth rate. It cannot
            directly observe customer retention rates or contract structures. A high VMS score
            suggests the business <em>looks like</em> a VMS company in its financials; qualitative
            research into the actual product and competitive position is always required.
          </div>
        </div>
      )}
    </div>
  );
};

export default VmsEducationCard;
