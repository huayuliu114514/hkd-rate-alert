import type { CurrencyMap, Preferences } from './types';

export const COLORS = {
  canvas: '#F3F5F1',
  surface: '#FFFFFF',
  ink: '#172321',
  muted: '#65726E',
  line: '#D7DEDA',
  lineStrong: '#AAB7B2',
  teal: '#176B5C',
  tealSoft: '#DCEFE9',
  coral: '#D8563F',
  coralSoft: '#F8E4DF',
  gold: '#B88416',
  goldSoft: '#F5ECD5',
  white: '#FFFFFF',
  overlay: 'rgba(14, 27, 24, 0.42)',
} as const;

export const FONTS = {
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
  semibold: 'SpaceGrotesk_600SemiBold',
  bold: 'SpaceGrotesk_700Bold',
} as const;

export const DEFAULT_PREFERENCES: Preferences = {
  baseCurrency: 'HKD',
  quoteCurrency: 'CNY',
  lookbackDays: 30,
  alertMode: 'low',
  tolerancePct: 0.1,
  percentileBand: 10,
  amount: '100',
};

export const LOOKBACK_OPTIONS = [7, 30, 60, 90] as const;

export const STORAGE_KEYS = {
  preferences: 'rate-watch/preferences/v1',
  rates: 'rate-watch/rates/v1',
  currencies: 'rate-watch/currencies/v1',
} as const;

export const CURRENCY_NAMES_ZH: CurrencyMap = {
  AUD: '澳大利亚元',
  BRL: '巴西雷亚尔',
  CAD: '加拿大元',
  CHF: '瑞士法郎',
  CNY: '人民币',
  CZK: '捷克克朗',
  DKK: '丹麦克朗',
  EUR: '欧元',
  GBP: '英镑',
  HKD: '港元',
  HUF: '匈牙利福林',
  IDR: '印度尼西亚卢比',
  ILS: '以色列新谢克尔',
  INR: '印度卢比',
  ISK: '冰岛克朗',
  JPY: '日元',
  KRW: '韩元',
  MXN: '墨西哥比索',
  MYR: '马来西亚林吉特',
  NOK: '挪威克朗',
  NZD: '新西兰元',
  PHP: '菲律宾比索',
  PLN: '波兰兹罗提',
  RON: '罗马尼亚列伊',
  SEK: '瑞典克朗',
  SGD: '新加坡元',
  THB: '泰铢',
  TRY: '土耳其里拉',
  USD: '美元',
  ZAR: '南非兰特',
};

export const FALLBACK_CURRENCIES: CurrencyMap = { ...CURRENCY_NAMES_ZH };