export type AlertMode = 'high' | 'low';

export interface RatePoint {
  date: string;
  rate: number;
}

export interface RateSummary {
  date: string;
  current: number;
  minimum: number;
  maximum: number;
  average: number;
  percentile: number;
  distanceFromTargetPct: number;
  alert: boolean;
}

export interface Preferences {
  baseCurrency: string;
  quoteCurrency: string;
  lookbackDays: number;
  alertMode: AlertMode;
  tolerancePct: number;
  percentileBand: number;
  amount: string;
}

export interface CachedRates {
  baseCurrency: string;
  quoteCurrency: string;
  lookbackDays: number;
  fetchedAt: string;
  rates: RatePoint[];
}

export type CurrencyMap = Record<string, string>;