export const COMPANY_QUALITY_VERSION = 1;

export const COMPANY_QUALITY_TIERS = [
  "Exceptional",
  "Good",
  "Average",
  "Caution",
] as const;

export type CompanyQuality = (typeof COMPANY_QUALITY_TIERS)[number];
export type StoredCompanyQuality = CompanyQuality | "Speculative";
export type QualityConfidence = "high" | "unavailable";

export interface CompanyQualityInputs {
  roe?: number | null;
  debtToEquity?: number | null;
  currentRatio?: number | null;
  revenueGrowth?: number | null;
  earningsStability?: string | null;
  competitivePosition?: string | null;
}

export interface CompanyQualityEvaluation {
  quality: CompanyQuality | null;
  confidence: QualityConfidence;
  score: number | null;
  version: number;
  reasons: string[];
  missingInputs: Array<keyof CompanyQualityInputs>;
}

/** Converts quality labels stored before the Caution rename for presentation. */
export function normalizeCompanyQuality(
  quality: string | null | undefined,
): CompanyQuality | null {
  if (quality === "Speculative") return "Caution";
  return COMPANY_QUALITY_TIERS.includes(quality as CompanyQuality)
    ? quality as CompanyQuality
    : null;
}

const STABILITY_SCORES: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
const POSITION_SCORES: Record<string, number> = { Strong: 3, Good: 2, Average: 1, Weak: 0 };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function evaluateCompanyQuality(inputs: CompanyQualityInputs): CompanyQualityEvaluation {
  const missingInputs: Array<keyof CompanyQualityInputs> = [];
  if (!isFiniteNumber(inputs.roe)) missingInputs.push("roe");
  if (!isFiniteNumber(inputs.debtToEquity) || inputs.debtToEquity < 0) missingInputs.push("debtToEquity");
  if (!isFiniteNumber(inputs.currentRatio) || inputs.currentRatio <= 0) missingInputs.push("currentRatio");
  if (!isFiniteNumber(inputs.revenueGrowth)) missingInputs.push("revenueGrowth");
  if (!inputs.earningsStability || !(inputs.earningsStability in STABILITY_SCORES)) missingInputs.push("earningsStability");
  if (!inputs.competitivePosition || !(inputs.competitivePosition in POSITION_SCORES)) missingInputs.push("competitivePosition");

  if (missingInputs.length > 0) {
    return {
      quality: null,
      confidence: "unavailable",
      score: null,
      version: COMPANY_QUALITY_VERSION,
      reasons: [`Quality unavailable: missing or invalid ${missingInputs.join(", ")}`],
      missingInputs,
    };
  }

  const roe = inputs.roe!;
  const debtToEquity = inputs.debtToEquity!;
  const currentRatio = inputs.currentRatio!;
  const revenueGrowth = inputs.revenueGrowth!;
  const earningsStability = inputs.earningsStability!;
  const competitivePosition = inputs.competitivePosition!;

  let score = roe >= 30 ? 4 : roe >= 20 ? 3 : roe >= 15 ? 2 : roe >= 10 ? 1 : 0;
  score += debtToEquity < 0.3 ? 4 : debtToEquity < 0.5 ? 3 : debtToEquity < 1 ? 2 : debtToEquity < 1.5 ? 1 : 0;
  score += currentRatio >= 2 ? 3 : currentRatio >= 1.5 ? 2 : currentRatio >= 1 ? 1 : 0;
  score += revenueGrowth >= 15 ? 3 : revenueGrowth >= 10 ? 2 : revenueGrowth >= 5 ? 1 : 0;
  score += STABILITY_SCORES[earningsStability];
  score += POSITION_SCORES[competitivePosition];

  const hardRisks: string[] = [];
  if (debtToEquity > 2) hardRisks.push(`Debt-to-equity of ${debtToEquity.toFixed(1)} exceeds the 2.0 severe-risk ceiling`);
  if (currentRatio < 1) hardRisks.push(`Current ratio of ${currentRatio.toFixed(1)} is below 1.0`);
  if (roe < 10) hardRisks.push(`ROE of ${roe.toFixed(1)}% is below 10%`);

  const quality: CompanyQuality = hardRisks.length > 0
    ? "Caution"
    : score >= 16 ? "Exceptional"
    : score >= 12 ? "Good"
    : score >= 8 ? "Average"
    : "Caution";

  const reasons = hardRisks.length > 0
    ? hardRisks
    : [`Six-factor quality score: ${score}/20`];

  return {
    quality,
    confidence: "high",
    score,
    version: COMPANY_QUALITY_VERSION,
    reasons,
    missingInputs: [],
  };
}

export const isResearchQuality = (
  quality: CompanyQuality | null,
): quality is "Exceptional" | "Good" => quality === "Exceptional" || quality === "Good";
