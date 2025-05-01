export interface ResearchStock {
  symbol: string;
  name: string;
  price: number;
  intrinsicValue: number;
  discount: number;
  quality: 'Exceptional' | 'Good' | 'Average' | 'Speculative';
}