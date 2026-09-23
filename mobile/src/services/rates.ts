import type {
  AlertMode,
  CurrencyMap,
  RatePoint,
  RateSummary,
} from '../types';

const RATE_API = 'https://api.frankfurter.dev/v1';

interface RateApiPayload {
  rates?: Record<string, Record<string, number>>;
  message?: string;
}

function startDate(lookbackDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() - lookbackDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? `请求失败 (${response.status})`);
  }
  return payload;
}

export async function fetchCurrencies(signal?: AbortSignal): Promise<CurrencyMap> {
  const response = await fetch(`${RATE_API}/currencies`, { signal });
  const payload = await readJson<CurrencyMap>(response);
  return Object.fromEntries(
    Object.entries(payload).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export async function fetchRateSeries(
  baseCurrency: string,
  quoteCurrency: string,
  lookbackDays: number,
  signal?: AbortSignal,
): Promise<RatePoint[]> {
  if (baseCurrency === quoteCurrency) {
    throw new Error('基准货币和报价货币不能相同');
  }

  const parameters = new URLSearchParams({
    from: baseCurrency,
    to: quoteCurrency,
  });
  const response = await fetch(
    `${RATE_API}/${startDate(lookbackDays)}..?${parameters.toString()}`,
    { signal },
  );
  const payload = await readJson<RateApiPayload>(response);
  const points = Object.entries(payload.rates ?? {})
    .map(([date, values]) => ({ date, rate: values[quoteCurrency] }))
    .filter((point): point is RatePoint => Number.isFinite(point.rate))
    .sort((left, right) => left.date.localeCompare(right.date));

  if (points.length === 0) {
    throw new Error('没有可用的汇率数据');
  }
  return points;
}

export function summarizeRates(
  rates: RatePoint[],
  alertMode: AlertMode,
  tolerancePct: number,
  percentileBand: number,
): RateSummary | null {
  if (rates.length === 0) {
    return null;
  }

  const latest = rates[rates.length - 1];
  const values = rates.map(({ rate }) => rate);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const lowerOrEqual = values.filter((value) => value <= latest.rate).length;
  const percentile = (100 * lowerOrEqual) / values.length;
  const isHighMode = alertMode === 'high';
  const nearTarget = isHighMode
    ? latest.rate >= maximum * (1 - tolerancePct / 100)
    : latest.rate <= minimum * (1 + tolerancePct / 100);
  const insidePercentileBand = isHighMode
    ? percentile >= 100 - percentileBand
    : percentile <= percentileBand;
  const distanceFromTargetPct = isHighMode
    ? (1 - latest.rate / maximum) * 100
    : (latest.rate / minimum - 1) * 100;

  return {
    date: latest.date,
    current: latest.rate,
    minimum,
    maximum,
    average: values.reduce((total, value) => total + value, 0) / values.length,
    percentile,
    distanceFromTargetPct,
    alert: nearTarget || insidePercentileBand,
  };
}