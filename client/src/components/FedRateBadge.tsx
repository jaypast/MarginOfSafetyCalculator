import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { FedRateResponse } from '@/lib/types';

// Wire response — the server returns `{ environment: null }` when the
// FRED fetch failed and no cache exists, which we treat as "hide".
type FedRateWireResponse = FedRateResponse | { environment: null };

const STYLES: Record<
  'rising' | 'stable' | 'falling',
  { label: string; classes: string; Icon: typeof TrendingUp }
> = {
  rising: {
    label: 'Rates rising',
    classes: 'bg-rose-50 text-rose-800 border-rose-200',
    Icon: TrendingUp,
  },
  stable: {
    label: 'Rates stable',
    classes: 'bg-neutral-50 text-neutral-700 border-neutral-200',
    Icon: Minus,
  },
  falling: {
    label: 'Rates falling',
    classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: TrendingDown,
  },
};

const FedRateBadge: React.FC = () => {
  const { data, isError } = useQuery<FedRateWireResponse>({
    queryKey: ['/api/macro/fed-rate'],
    staleTime: 60 * 60 * 1000, // 1h client cache; server caches 24h
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Hide gracefully on error or when the server reported the upstream
  // was unavailable. The badge is informational — never a hard failure.
  if (isError || !data || data.environment == null) return null;

  const fed = data as FedRateResponse;
  const style = STYLES[fed.environment];
  const Icon = style.Icon;
  const sign = fed.deltaBp > 0 ? '+' : '';

  return (
    <span
      data-testid="badge-fed-rate"
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${style.classes}`}
      title={`Fed funds rate ${fed.currentRate.toFixed(2)}% (vs. ${fed.yearAgoRate.toFixed(2)}% a year ago, Δ ${sign}${fed.deltaBp}bp). As of ${fed.asOf}. Source: FRED.`}
    >
      <Icon className="w-3 h-3 mr-1" />
      {style.label} ({sign}
      {fed.deltaBp}bp YoY)
    </span>
  );
};

export default FedRateBadge;
