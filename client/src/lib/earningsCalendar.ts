export type MonthClassification = 'newsy' | 'repetitive' | 'quiet';

export interface EarningsCalendarInfo {
  classification: MonthClassification;
  quarterContext: string;
  label: string;
  explanation: string;
}

const QUARTER_CONTEXTS: Record<number, string> = {
  1: 'Q4 earnings season',
  2: 'Q4 earnings season',
  3: 'Q4 earnings season',
  4: 'Q1 earnings season',
  5: 'Q1 earnings season',
  6: 'Q1 earnings season',
  7: 'Q2 earnings season',
  8: 'Q2 earnings season',
  9: 'Q2 earnings season',
  10: 'Q3 earnings season',
  11: 'Q3 earnings season',
  12: 'Q3 earnings season',
};

export function getEarningsCalendarInfo(date: Date = new Date()): EarningsCalendarInfo {
  const month = date.getMonth() + 1;
  const quarterContext = QUARTER_CONTEXTS[month];

  if (month === 1 || month === 4 || month === 7 || month === 10) {
    return {
      classification: 'newsy',
      quarterContext,
      label: 'Earnings Season Start',
      explanation:
        'Fresh earnings reports are arriving this month. Prices often reset closer to fair value as the market digests new information — a reasonable time to evaluate entry points.',
    };
  }

  if (month === 2 || month === 5 || month === 8 || month === 11) {
    return {
      classification: 'repetitive',
      quarterContext,
      label: 'Mid-Season Drift Risk',
      explanation:
        'Earnings news is still flowing, but research suggests prices can drift above fair value this month as investors overreact to repeated signals. The Buy Below price shown may be harder to reach until next earnings season resets expectations.',
    };
  }

  return {
    classification: 'quiet',
    quarterContext,
    label: 'Between Earnings Seasons',
    explanation:
      'This is a quieter period between major earnings cycles. Price movements tend to be driven more by macro news than company fundamentals — valuations can still be useful, but expect less earnings-driven volatility.',
  };
}
