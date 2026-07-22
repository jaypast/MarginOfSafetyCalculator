import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Info, AlertTriangle } from 'lucide-react';
import type { StockData } from '@/lib/types';
import {
  scoreTicker,
  compositeBand,
  MIN_RELIABLE_FACTORS,
  type SubScore,
} from '@/lib/multibaggerScreener';

interface Props {
  stockData: StockData;
}

const TONE_CLASSES: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  neutral: 'bg-amber-100 text-amber-800 border-amber-300',
  negative: 'bg-rose-100 text-rose-800 border-rose-300',
  muted: 'bg-neutral-100 text-neutral-600 border-neutral-300',
};

function scoreToTone(score: number | null): keyof typeof TONE_CLASSES {
  if (score === null) return 'muted';
  if (score >= 65) return 'positive';
  if (score >= 40) return 'neutral';
  return 'negative';
}

const SubScoreRow: React.FC<{ row: SubScore }> = ({ row }) => {
  const tone = scoreToTone(row.score);
  const pct = row.score === null ? 0 : row.score;
  const barColor =
    tone === 'positive' ? 'bg-emerald-500'
    : tone === 'neutral' ? 'bg-amber-500'
    : tone === 'negative' ? 'bg-rose-500'
    : 'bg-neutral-300';
  return (
    <div className="py-2" data-testid={`screener-row-${row.key}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[#1A2942]">{row.label}</span>
        <span
          className={`text-xs tabular-nums px-2 py-0.5 rounded-full border ${TONE_CLASSES[tone]}`}
          data-testid={`screener-score-${row.key}`}
        >
          {row.score === null ? 'N/A' : row.score.toFixed(0)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: row.score === null ? '0%' : `${pct}%` }}
        />
      </div>
      <p className="text-xs text-neutral-600 mt-1">{row.rationale}</p>
    </div>
  );
};

const MultibaggerScreener: React.FC<Props> = ({ stockData }) => {
  const result = scoreTicker(stockData);
  const band = compositeBand(result.composite);
  const tone = band.tone;

  return (
    <Card className="bg-white border border-neutral-200 shadow-sm" data-testid="multibagger-screener">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-[#1A2942] flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Multibagger Screener
            </h2>
            <p className="text-xs text-neutral-600 mt-0.5">
              Factor-exposure overlap with the historical multibagger cohort
              (Yartseva 2025). <strong>Descriptive, not predictive.</strong>
            </p>
          </div>
          <div className="text-right shrink-0">
            <div
              className={`inline-flex flex-col items-center px-3 py-2 rounded-lg border ${result.lowConfidence ? TONE_CLASSES.muted : TONE_CLASSES[tone]}`}
              data-testid="screener-composite"
            >
              <span className="text-2xl font-bold tabular-nums leading-none inline-flex items-center gap-1">
                {result.lowConfidence && (
                  <AlertTriangle className="w-4 h-4 text-amber-500" aria-hidden="true" />
                )}
                {result.composite === null ? '—' : result.composite.toFixed(0)}
              </span>
              <span className="text-[10px] uppercase tracking-wide mt-1">
                {result.lowConfidence ? 'Low confidence' : band.label}
              </span>
            </div>
          </div>
        </div>

        {result.lowConfidence && (
          <div
            className="mb-3 rounded-md bg-amber-50 border border-amber-300 p-2.5 text-xs text-amber-900 flex gap-2"
            data-testid="screener-low-confidence-warning"
          >
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
            <div>
              <strong>Score is not reliable:</strong> only {result.computedFactors} of{' '}
              {result.subScores.length} factors could be computed (need at least{' '}
              {MIN_RELIABLE_FACTORS}). Missing: {result.missingFactors.join(', ')}. The
              composite leans too heavily on the factors that happened to be available —
              treat it as incomplete, not as a real factor-exposure score.
            </div>
          </div>
        )}

        <div className="divide-y divide-neutral-100">
          {result.subScores.map((row) => (
            <SubScoreRow key={row.key} row={row} />
          ))}
        </div>

        <div className="mt-3 rounded-md bg-neutral-50 border border-neutral-200 p-2.5 text-xs text-neutral-700 flex gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-500" />
          <div>
            <strong>Growth-rate is intentionally excluded.</strong> Yartseva's
            general-to-specific elimination dropped EBITDA / EPS / FCF
            growth-rate as insignificant return predictors. P/E and balance-sheet
            ratios are similarly omitted from the score (they remain useful as
            survival filters in the Value-Investor Verdict). See the
            <code className="mx-1 px-1 py-0.5 bg-neutral-100 rounded">multibagger-empirics</code>
            skill for the rationale.
          </div>
        </div>

        {result.missingFactors.length > 0 && !result.lowConfidence && (
          <div className="mt-2 text-[11px] text-neutral-500">
            <Badge variant="outline" className="mr-1">Note</Badge>
            Composite renormalised across {result.computedFactors}/
            {result.subScores.length} factors — {result.missingFactors.join(', ')} unavailable.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MultibaggerScreener;
