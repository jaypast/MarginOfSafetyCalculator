import React, { useState, useEffect } from 'react';
import StockInformation from './StockInformation';
import KeyMetrics from './KeyMetrics';
import ValuationMethod from './ValuationMethod';
import MarginOfSafetyParams from './MarginOfSafetyParams';
import ValuationResults from './ValuationResults';
import ValueInvestorVerdict from './ValueInvestorVerdict';
import MultibaggerScreener from './MultibaggerScreener';
import QualityIndicators from './QualityIndicators';
import EducationalResources from './EducationalResources';
import DecisionHeadline from './DecisionHeadline';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useStockData } from '@/hooks/useStockData';
import { useQuery } from '@tanstack/react-query';
import type { FedRateResponse } from '@/lib/types';
import {
  StockData,
  ValuationParams,
  MarginOfSafetyParams as MoSParams,
  ValuationResult,
  CalculationMethod,
  CompanyQualityResult,
  ReverseDCFResult
} from '@/lib/types';
import {
  calculateDCFDetailed,
  calculatePEDetailed,
  calculateGrahamDetailed,
  calculateBuyBelow,
  calculateDiscountPremium,
  calculateAverageValuation,
  calculateBuyBelowStatus,
  calculateReverseDCFDetailed
} from '@/lib/calculators';
import { getCompanyQuality, getRecommendedMarginOfSafety, getDefaultMarginOfSafety } from '@/lib/utils';
import SectorWarningCard from './SectorWarningCard';
import VmsEducationCard from './VmsEducationCard';
import { computeVmsScore, computeSectorWarning } from '@/lib/vmsScore';
import { computeInsiderSignal, type InsiderSignal } from '@/lib/insiderSignal';
import { useSearch } from 'wouter';

type FedRateWireResponse = FedRateResponse | { environment: null };

// ---------------------------------------------------------------------------
// SectionPanel — thin wrapper so every evidence card has identical chrome:
// white rounded card, trigger header with title + one-line subtitle, chevron.
// All panels start collapsed (defaultOpen = false) unless told otherwise.
// ---------------------------------------------------------------------------
interface SectionPanelProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}

const SectionPanel: React.FC<SectionPanelProps> = ({
  title,
  subtitle,
  children,
  defaultOpen = false,
  testId,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="bg-white rounded-lg shadow-sm border border-neutral-200"
      data-testid={testId}
    >
      <CollapsibleTrigger className="flex items-start justify-between w-full p-4 text-left hover:bg-neutral-50 rounded-lg transition-colors">
        <div>
          <h2 className="text-base font-semibold text-[#1A2942]">{title}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="rounded-full bg-neutral-100 p-1 ml-3 shrink-0 mt-0.5">
          {open
            ? <ChevronUp className="h-4 w-4 text-neutral-500" />
            : <ChevronDown className="h-4 w-4 text-neutral-500" />}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-neutral-100">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const MarginOfSafetyCalculator: React.FC = () => {
  const { stockData, isLoading, isError, error, fetchStockData } = useStockData();

  // Auto-load a symbol passed via ?symbol=AAPL (e.g. from watchlist row click).
  // Runs once on mount; ignores subsequent search-string changes so the user
  // can freely edit the symbol field after landing without a re-trigger.
  const search = useSearch();
  const didAutoLoad = React.useRef(false);
  useEffect(() => {
    if (didAutoLoad.current) return;
    const sym = new URLSearchParams(search).get('symbol');
    if (sym) {
      didAutoLoad.current = true;
      fetchStockData(sym.toUpperCase());
    }
  }, []);

  const { data: fedRateData } = useQuery<FedRateWireResponse>({
    queryKey: ['/api/macro/fed-rate'],
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const fedRateEnvironment: FedRateResponse | null =
    fedRateData && fedRateData.environment != null
      ? (fedRateData as FedRateResponse)
      : null;

  const [activeMethod, setActiveMethod] = useState<CalculationMethod>('dcf');

  const [valuationParams, setValuationParams] = useState<ValuationParams>({
    dcfGrowthRate: 10,
    dcfDiscountRate: 12,
    dcfTerminalMultiple: 15,
    dcfForecastPeriod: 5,
    peType: 'current',
    peCustomValue: 15,
    peAdjustment: 100,
    grahamGrowthRate: 11.8,
    grahamBaseValue: 8.5,
  });

  const [marginOfSafetyParams, setMarginOfSafetyParams] = useState<MoSParams>({
    marginOfSafety: 25,
  });

  const [valuationResults, setValuationResults] = useState<ValuationResult[]>([]);
  const [companyQuality, setCompanyQuality] = useState<CompanyQualityResult | null>(null);
  const [reverseDCFResult, setReverseDCFResult] = useState<ReverseDCFResult | null>(null);
  const [insiderSignal, setInsiderSignal] = useState<InsiderSignal | null>(null);

  // Fetch insider activity whenever the symbol changes (Task #74).
  // The `cancelled` flag prevents a slow response from a previous symbol
  // from overwriting state for the current symbol (classic React cleanup).
  useEffect(() => {
    if (!stockData?.symbol || stockData.error) {
      setInsiderSignal(null);
      return;
    }
    let cancelled = false;
    const sym = stockData.symbol;
    fetch(`/api/insider/${encodeURIComponent(sym)}`)
      .then(r => r.ok ? r.json() : Promise.resolve({ trades: [] }))
      .then(data => {
        if (!cancelled) {
          setInsiderSignal(computeInsiderSignal(data.trades ?? []));
        }
      })
      .catch(() => {
        // Silently suppress — VIV and QI gracefully handle null insiderSignal
      });
    return () => { cancelled = true; };
  }, [stockData?.symbol]);

  useEffect(() => {
    if (stockData && !stockData.error) {
      const quality = getCompanyQuality(
        stockData.roe,
        stockData.debtToEquity,
        stockData.currentRatio,
        stockData.revenueGrowth,
        stockData.earningsStability,
        stockData.competitivePosition,
      );
      const recommendedMoS = getRecommendedMarginOfSafety(quality);
      const defaultMoS = getDefaultMarginOfSafety(quality);
      setCompanyQuality({ quality, recommendedMarginOfSafety: recommendedMoS });
      setMarginOfSafetyParams({ marginOfSafety: defaultMoS });
      setTimeout(() => calculateIntrinsicValue(), 500);
    }
  }, [stockData]);

  const calculateIntrinsicValue = () => {
    if (!stockData || stockData.error) return;
    const price = stockData.price;

    const dcf = calculateDCFDetailed(stockData, valuationParams);
    const dcfBuyBelow = calculateBuyBelow(dcf.value, marginOfSafetyParams.marginOfSafety);
    const dcfDiscountPremium = calculateDiscountPremium(price, dcf.value);
    const dcfBuyBelowStatus = calculateBuyBelowStatus(price, dcfBuyBelow);

    const pe = calculatePEDetailed(stockData, valuationParams);
    const peBuyBelow = calculateBuyBelow(pe.value, marginOfSafetyParams.marginOfSafety);
    const peDiscountPremium = calculateDiscountPremium(price, pe.value);
    const peBuyBelowStatus = calculateBuyBelowStatus(price, peBuyBelow);

    const graham = calculateGrahamDetailed(stockData, valuationParams);
    const grahamBuyBelow = calculateBuyBelow(graham.value, marginOfSafetyParams.marginOfSafety);
    const grahamDiscountPremium = calculateDiscountPremium(price, graham.value);
    const grahamBuyBelowStatus = calculateBuyBelowStatus(price, grahamBuyBelow);

    const results: ValuationResult[] = [
      {
        method: 'DCF Analysis',
        intrinsicValue: dcf.value,
        buyBelow: dcfBuyBelow,
        discountPremium: dcfDiscountPremium,
        buyBelowStatus: dcfBuyBelowStatus,
        appliedAdjustments: dcf.appliedAdjustments,
      },
      {
        method: 'P/E Based',
        intrinsicValue: pe.value,
        buyBelow: peBuyBelow,
        discountPremium: peDiscountPremium,
        buyBelowStatus: peBuyBelowStatus,
        appliedAdjustments: pe.appliedAdjustments,
      },
      {
        method: 'Graham Formula',
        intrinsicValue: graham.value,
        buyBelow: grahamBuyBelow,
        discountPremium: grahamDiscountPremium,
        buyBelowStatus: grahamBuyBelowStatus,
        appliedAdjustments: graham.appliedAdjustments,
      },
    ];

    const avgResult = calculateAverageValuation(results, price);
    setValuationResults([...results, avgResult]);

    const reverse = calculateReverseDCFDetailed(stockData, valuationParams);
    setReverseDCFResult(reverse);
  };

  useEffect(() => {
    if (stockData && !stockData.error) {
      calculateIntrinsicValue();
    }
  }, [marginOfSafetyParams, valuationParams]);

  const hasResults = stockData && !stockData.error && valuationResults.length > 0;

  return (
    <>
      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-[#1A2942] mb-2">
              Margin of Safety Calculator
            </h1>
            <p className="text-neutral-600">
              Calculate intrinsic value and determine buy-below thresholds following Benjamin Graham's principles
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex flex-col md:items-end gap-2">
            <a
              href="#educational-resources"
              className="text-[#2A3E5C] hover:text-[#1A2942] text-sm flex items-center"
            >
              <Info size={14} className="mr-1" />
              Learn more about Margin of Safety
            </a>
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-3">
        {/* Search box — always visible */}
        <StockInformation
          stockData={stockData}
          isLoading={isLoading}
          onFetchData={fetchStockData}
          error={isError}
          errorMessage={
            error instanceof Error
              ? error.message
              : 'Could not retrieve stock data. Please try again.'
          }
          marginOfSafety={marginOfSafetyParams.marginOfSafety}
        />

        {/* Decision headline — the single most-important answer, always visible
            once stock data is loaded. Replaces the buried buy-below comparison
            that used to live inside the ValuationResults card. */}
        {stockData && !stockData.error && (
          <DecisionHeadline
            stockData={stockData}
            valuationResults={valuationResults}
            marginOfSafety={marginOfSafetyParams.marginOfSafety}
          />
        )}

        {/* Sector warning / VMS confidence card — rendered inline (not in a
            SectionPanel) so it reads as an alert rather than an evidence panel.
            Only appears when computeSectorWarning fires. */}
        {stockData && !stockData.error && (() => {
          const vms = computeVmsScore(stockData);
          const impliedGrowth = reverseDCFResult?.impliedGrowthRate ?? null;
          const warning = computeSectorWarning(stockData, vms.score, impliedGrowth);
          if (!warning) return null;
          return (
            <SectorWarningCard
              warning={warning}
              dismissKey={stockData.symbol}
            />
          );
        })()}

        {/* Evidence panels — all collapsed by default so the headline is the
            only thing the user sees until they want to drill in. */}

        {hasResults && (
          <SectionPanel
            title="Valuation Results"
            subtitle="DCF · P/E · Graham — intrinsic values, buy-below prices and method comparison"
            testId="section-valuation-results"
          >
            <ValuationResults
              valuationResults={valuationResults}
              stockData={stockData}
              activeMethod={activeMethod}
              valuationParams={valuationParams}
              marginOfSafetyParams={marginOfSafetyParams}
              reverseDCFResult={reverseDCFResult}
            />
          </SectionPanel>
        )}

        {hasResults && (
          <SectionPanel
            title="Value-Investor Verdict"
            subtitle="Buy / Watch / Pass — Graham, Klarman, Munger gates applied to this stock"
            testId="section-verdict"
          >
            <ValueInvestorVerdict
              stockData={stockData!}
              valuationResults={valuationResults}
              reverseDCFResult={reverseDCFResult}
              companyQuality={companyQuality}
              marginOfSafetyParams={marginOfSafetyParams}
              fedRateEnvironment={fedRateEnvironment}
              insiderTier={insiderSignal?.tier ?? null}
            />
          </SectionPanel>
        )}

        {stockData && !stockData.error && (
          <SectionPanel
            title="Multibagger Screener"
            subtitle="Factor-exposure overlap with historical multibaggers — descriptive, not predictive (Yartseva 2025)"
            testId="section-screener"
          >
            <MultibaggerScreener stockData={stockData} />
          </SectionPanel>
        )}

        {stockData && !stockData.error && (
          <SectionPanel
            title="Margin of Safety"
            subtitle={`Adjust your required discount — currently ${marginOfSafetyParams.marginOfSafety}%`}
            testId="section-mos-params"
          >
            <div className="p-4">
              <MarginOfSafetyParams
                marginOfSafetyParams={marginOfSafetyParams}
                setMarginOfSafetyParams={setMarginOfSafetyParams}
                companyQuality={companyQuality}
                onCalculate={calculateIntrinsicValue}
                stockData={stockData}
              />
            </div>
          </SectionPanel>
        )}

        {stockData && !stockData.error && (
          <SectionPanel
            title="Valuation Method"
            subtitle="Adjust DCF, P/E, or Graham formula parameters"
            testId="section-method"
          >
            <div className="p-4">
              <ValuationMethod
                activeMethod={activeMethod}
                setActiveMethod={setActiveMethod}
                valuationParams={valuationParams}
                setValuationParams={setValuationParams}
                stockData={stockData}
                onCalculate={calculateIntrinsicValue}
              />
            </div>
          </SectionPanel>
        )}

        {((stockData && !stockData.error) || isLoading) && (
          <SectionPanel
            title="Key Metrics"
            subtitle="EPS · FCF/share · P/E · ROE · growth rate — raw inputs driving the valuation"
            testId="section-key-metrics"
          >
            <div className="p-4">
              <KeyMetrics
                stockData={stockData}
                isLoading={isLoading}
                companyQuality={companyQuality?.quality}
              />
            </div>
          </SectionPanel>
        )}

        {stockData && !stockData.error && companyQuality && (
          <SectionPanel
            title="Quality Indicators"
            subtitle="Financial strength · earnings stability · competitive position · recommended MoS"
            testId="section-quality"
          >
            <QualityIndicators
              stockData={stockData}
              companyQuality={companyQuality}
              insiderSignal={insiderSignal}
            />
          </SectionPanel>
        )}

        {/* VMS education card — appears when score ≥ 50 or a sector warning
            is firing, so the user always has context for the alert they see. */}
        {stockData && !stockData.error && (() => {
          const vms = computeVmsScore(stockData);
          const impliedGrowth = reverseDCFResult?.impliedGrowthRate ?? null;
          const warning = computeSectorWarning(stockData, vms.score, impliedGrowth);
          if (vms.score < 50 && !warning) return null;
          return (
            <VmsEducationCard
              vmsScore={vms.score}
              hasSectorWarning={warning !== null}
            />
          );
        })()}

        {/* Educational resources — always visible at the bottom */}
        <div id="educational-resources">
          <EducationalResources />
        </div>
      </main>
    </>
  );
};

export default MarginOfSafetyCalculator;
