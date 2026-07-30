/**
 * SectorWarningCard — contextual banner shown on the stock detail page.
 *
 * Renders an amber caution card when the standard DCF/P/E/Graham toolkit
 * has known limitations for this stock type (binary-outcome biotech,
 * high-growth platform with thin margins), or a green confidence card
 * when the stock shows VMS-like characteristics that make DCF especially
 * reliable.
 *
 * Dismissable via sessionStorage so it doesn't clutter repeat views.
 * Renders nothing when computeSectorWarning returns null.
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp, X } from 'lucide-react';
import { SectorWarning } from '@/lib/vmsScore';

interface SectorWarningCardProps {
  warning: SectorWarning | null;
  /** Key used to remember the dismissed state across the current session */
  dismissKey: string;
}

const SectorWarningCard: React.FC<SectorWarningCardProps> = ({ warning, dismissKey }) => {
  const storageKey = `sector-warning-dismissed-${dismissKey}`;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(storageKey) === 'true');
    } catch {
      // sessionStorage unavailable in some contexts — show by default
    }
  }, [storageKey]);

  if (!warning || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(storageKey, 'true');
    } catch {
      // ignore
    }
  };

  const isGreen = warning.variant === 'green';

  return (
    <div
      className={`relative flex items-start gap-3 rounded-lg border p-4 ${
        isGreen
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-amber-50 border-amber-200'
      }`}
      data-testid="sector-warning-card"
    >
      {isGreen ? (
        <TrendingUp className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold mb-1 ${isGreen ? 'text-emerald-800' : 'text-amber-800'}`}>
          {warning.title}
        </p>
        <p className={`text-sm ${isGreen ? 'text-emerald-700' : 'text-amber-700'}`}>
          {warning.message}
        </p>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className={`shrink-0 rounded p-0.5 hover:bg-black/10 transition-colors ${
          isGreen ? 'text-emerald-600' : 'text-amber-600'
        }`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default SectorWarningCard;
