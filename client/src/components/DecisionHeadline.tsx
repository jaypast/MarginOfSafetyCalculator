import React from 'react';
import { TrendingDown, Minus, TrendingUp } from 'lucide-react';
import type { StockData, ValuationResult } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { buildDecisionHeadline } from '@/lib/decisionHeadline';

interface Props {
  stockData: StockData | undefined;
  valuationResults: ValuationResult[];
  marginOfSafety: number;
}

const ZONE_CONFIG = {
  buy: {
    bg: 'bg-emerald-50 border-emerald-200',
    pillBg: 'bg-emerald-600 text-white',
    label: 'In buy zone',
    icon: TrendingDown,
    iconColor: 'text-emerald-600',
    textColor: 'text-emerald-900',
    sentenceColor: 'text-emerald-800',
  },
  near: {
    bg: 'bg-amber-50 border-amber-200',
    pillBg: 'bg-amber-500 text-white',
    label: 'Near buy zone',
    icon: Minus,
    iconColor: 'text-amber-600',
    textColor: 'text-amber-900',
    sentenceColor: 'text-amber-800',
  },
  neutral: {
    bg: 'bg-neutral-50 border-neutral-200',
    pillBg: 'bg-neutral-500 text-white',
    label: 'Above buy-below',
    icon: TrendingUp,
    iconColor: 'text-neutral-500',
    textColor: 'text-neutral-800',
    sentenceColor: 'text-neutral-700',
  },
} as const;

const DecisionHeadline: React.FC<Props> = ({
  stockData,
  valuationResults,
  marginOfSafety,
}) => {
  const result = buildDecisionHeadline(stockData, valuationResults, marginOfSafety);

  if (!result.available) {
    if (result.reason === 'unmodelable' && stockData && !stockData.error) {
      return (
        <div
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600"
          data-testid="decision-headline-unavailable"
        >
          <span className="font-medium text-neutral-800">{stockData.symbol}</span>
          {' · '}
          <span className="tabular-nums">{formatCurrency(stockData.price)}</span>
          {'  ·  '}
          Valuation unavailable — earnings or FCF not modelable with standard methods.
        </div>
      );
    }
    return null;
  }

  const cfg = ZONE_CONFIG[result.zone];
  const Icon = cfg.icon;

  return (
    <div
      className={`rounded-lg border ${cfg.bg} px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3`}
      data-testid="decision-headline"
    >
      {/* Price + ticker */}
      <div className="flex items-center gap-2 shrink-0">
        <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
        <span className={`font-semibold text-base tabular-nums ${cfg.textColor}`}>
          {stockData!.symbol}
        </span>
        <span className={`text-base tabular-nums ${cfg.textColor}`}>
          {formatCurrency(result.price)}
        </span>
      </div>

      {/* Zone pill */}
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${cfg.pillBg} shrink-0`}
        data-testid="decision-headline-zone"
      >
        {cfg.label}
      </span>

      {/* Sentence */}
      <p className={`text-sm ${cfg.sentenceColor} min-w-0`} data-testid="decision-headline-sentence">
        {result.sentence}
      </p>
    </div>
  );
};

export default DecisionHeadline;
