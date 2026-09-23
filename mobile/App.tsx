import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeftRight,
  ChevronDown,
  Minus,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  WifiOff,
} from 'lucide-react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { CurrencyPicker } from './src/components/CurrencyPicker';
import { RateChart } from './src/components/RateChart';
import {
  COLORS,
  CURRENCY_NAMES_ZH,
  DEFAULT_PREFERENCES,
  FALLBACK_CURRENCIES,
  FONTS,
  LOOKBACK_OPTIONS,
  STORAGE_KEYS,
} from './src/constants';
import {
  fetchCurrencies,
  fetchRateSeries,
  summarizeRates,
} from './src/services/rates';
import type {
  AlertMode,
  CachedRates,
  CurrencyMap,
  Preferences,
  RatePoint,
} from './src/types';

type PickerTarget = 'base' | 'quote' | null;

const RATE_FORMATTER = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 5,
  maximumFractionDigits: 5,
});
const MONEY_FORMATTER = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function rateKey(preferences: Preferences): string {
  return [
    preferences.baseCurrency,
    preferences.quoteCurrency,
    preferences.lookbackDays,
  ].join(':');
}

function cachedRateKey(cache: CachedRates): string {
  return [cache.baseCurrency, cache.quoteCurrency, cache.lookbackDays].join(':');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function formatRateDate(date: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

function sanitizeAmount(value: string): string {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const [whole = '', ...decimals] = normalized.split('.');
  return decimals.length > 0 ? `${whole}.${decimals.join('')}` : whole;
}

function reverseMode(mode: AlertMode): AlertMode {
  return mode === 'high' ? 'low' : 'high';
}

interface CurrencyButtonProps {
  code: string;
  label: string;
  onPress: () => void;
}

function CurrencyButton({ code, label, onPress }: CurrencyButtonProps) {
  return (
    <Pressable
      accessibilityLabel={`选择${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.currencyButton, pressed && styles.pressed]}
    >
      <View style={styles.currencyButtonText}>
        <Text style={styles.currencyCode}>{code}</Text>
        <Text numberOfLines={1} style={styles.currencyLabel}>{label}</Text>
      </View>
      <ChevronDown color={COLORS.muted} size={17} strokeWidth={1.8} />
    </Pressable>
  );
}

interface StepperProps {
  decrementLabel: string;
  incrementLabel: string;
  label: string;
  onDecrement: () => void;
  onIncrement: () => void;
  value: string;
}

function Stepper({
  decrementLabel,
  incrementLabel,
  label,
  onDecrement,
  onIncrement,
  value,
}: StepperProps) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControl}>
        <Pressable
          accessibilityLabel={decrementLabel}
          hitSlop={6}
          onPress={onDecrement}
          style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
        >
          <Minus color={COLORS.ink} size={15} strokeWidth={2} />
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable
          accessibilityLabel={incrementLabel}
          hitSlop={6}
          onPress={onIncrement}
          style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
        >
          <Plus color={COLORS.ink} size={15} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

export default function App() {
  const { width: viewportWidth } = useWindowDimensions();
  const chartWidth = Math.min(Math.max(viewportWidth - 40, 280), 720);
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [currencies, setCurrencies] = useState<CurrencyMap>(FALLBACK_CURRENCIES);
  const [rates, setRates] = useState<RatePoint[]>([]);
  const [loadedRateKey, setLoadedRateKey] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [hydrated, setHydrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const requestId = useRef(0);
  const currentRateKey = rateKey(preferences);
  const visibleRates = loadedRateKey === currentRateKey ? rates : [];
  const error = loadError?.key === currentRateKey ? loadError.message : '';
  const loading = !hydrated || (visibleRates.length === 0 && !error);
  const summary = summarizeRates(
    visibleRates,
    preferences.alertMode,
    preferences.tolerancePct,
    preferences.percentileBand,
  );
  const baseName = CURRENCY_NAMES_ZH[preferences.baseCurrency]
    ?? currencies[preferences.baseCurrency]
    ?? preferences.baseCurrency;
  const quoteName = CURRENCY_NAMES_ZH[preferences.quoteCurrency]
    ?? currencies[preferences.quoteCurrency]
    ?? preferences.quoteCurrency;
  const amount = Number(preferences.amount) || 0;
  const convertedAmount = summary ? amount * summary.current : 0;
  const highMode = preferences.alertMode === 'high';

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      try {
        const entries = await AsyncStorage.multiGet([
          STORAGE_KEYS.preferences,
          STORAGE_KEYS.rates,
          STORAGE_KEYS.currencies,
        ]);
        const stored = Object.fromEntries(entries);
        const preferencesJson = stored[STORAGE_KEYS.preferences];
        const currenciesJson = stored[STORAGE_KEYS.currencies];
        const ratesJson = stored[STORAGE_KEYS.rates];
        const restoredPreferences = preferencesJson
          ? {
              ...DEFAULT_PREFERENCES,
              ...(JSON.parse(preferencesJson) as Partial<Preferences>),
            }
          : DEFAULT_PREFERENCES;

        if (!mounted) return;
        setPreferences(restoredPreferences);

        if (currenciesJson) {
          setCurrencies(JSON.parse(currenciesJson) as CurrencyMap);
        }
        if (ratesJson) {
          const cache = JSON.parse(ratesJson) as CachedRates;
          if (cachedRateKey(cache) === rateKey(restoredPreferences)) {
            setRates(cache.rates);
            setLoadedRateKey(cachedRateKey(cache));
            setFetchedAt(cache.fetchedAt);
          }
        }
      } catch {
        if (mounted) {
          setLoadError({
            key: rateKey(DEFAULT_PREFERENCES),
            message: '本地缓存读取失败，将重新获取数据',
          });
        }
      } finally {
        if (mounted) {
          setHydrated(true);
        }
      }
    }

    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      STORAGE_KEYS.preferences,
      JSON.stringify(preferences),
    ).catch(() => undefined);
  }, [hydrated, preferences]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    fetchCurrencies(controller.signal)
      .then((nextCurrencies) => {
        setCurrencies(nextCurrencies);
        return AsyncStorage.setItem(
          STORAGE_KEYS.currencies,
          JSON.stringify(nextCurrencies),
        );
      })
      .catch((fetchError: unknown) => {
        if (!isAbortError(fetchError)) {
          setCurrencies((current) => current);
        }
      });
    return () => controller.abort();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    const activeRequest = ++requestId.current;
    const requestedKey = currentRateKey;

    fetchRateSeries(
      preferences.baseCurrency,
      preferences.quoteCurrency,
      preferences.lookbackDays,
      controller.signal,
    )
      .then((nextRates) => {
        if (activeRequest !== requestId.current) return;
        const nextFetchedAt = new Date().toISOString();
        setRates(nextRates);
        setLoadedRateKey(requestedKey);
        setFetchedAt(nextFetchedAt);
        setLoadError(null);
        const cache: CachedRates = {
          baseCurrency: preferences.baseCurrency,
          quoteCurrency: preferences.quoteCurrency,
          lookbackDays: preferences.lookbackDays,
          fetchedAt: nextFetchedAt,
          rates: nextRates,
        };
        AsyncStorage.setItem(STORAGE_KEYS.rates, JSON.stringify(cache)).catch(
          () => undefined,
        );
      })
      .catch((fetchError: unknown) => {
        if (activeRequest === requestId.current && !isAbortError(fetchError)) {
          setLoadError({
            key: requestedKey,
            message: fetchError instanceof Error ? fetchError.message : '汇率加载失败',
          });
        }
      });

    return () => controller.abort();
  }, [
    currentRateKey,
    hydrated,
    preferences.baseCurrency,
    preferences.lookbackDays,
    preferences.quoteCurrency,
  ]);

  async function refreshRates() {
    const activeRequest = ++requestId.current;
    const requestedKey = currentRateKey;
    setRefreshing(true);
    setLoadError(null);
    try {
      const nextRates = await fetchRateSeries(
        preferences.baseCurrency,
        preferences.quoteCurrency,
        preferences.lookbackDays,
      );
      if (activeRequest !== requestId.current) return;
      const nextFetchedAt = new Date().toISOString();
      setRates(nextRates);
      setLoadedRateKey(requestedKey);
      setFetchedAt(nextFetchedAt);
      setLoadError(null);
      const cache: CachedRates = {
        baseCurrency: preferences.baseCurrency,
        quoteCurrency: preferences.quoteCurrency,
        lookbackDays: preferences.lookbackDays,
        fetchedAt: nextFetchedAt,
        rates: nextRates,
      };
      await AsyncStorage.setItem(STORAGE_KEYS.rates, JSON.stringify(cache));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (refreshError) {
      if (activeRequest === requestId.current) {
        setLoadError({
          key: requestedKey,
          message: refreshError instanceof Error ? refreshError.message : '刷新失败',
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      if (activeRequest === requestId.current) {
        setRefreshing(false);
      }
    }
  }

  function chooseCurrency(code: string) {
    if (!pickerTarget) return;
    setPreferences((current) => {
      if (pickerTarget === 'base') {
        return code === current.quoteCurrency
          ? {
              ...current,
              baseCurrency: code,
              quoteCurrency: current.baseCurrency,
              alertMode: reverseMode(current.alertMode),
            }
          : { ...current, baseCurrency: code };
      }
      return code === current.baseCurrency
        ? {
            ...current,
            baseCurrency: current.quoteCurrency,
            quoteCurrency: code,
            alertMode: reverseMode(current.alertMode),
          }
        : { ...current, quoteCurrency: code };
    });
    setPickerTarget(null);
    Haptics.selectionAsync().catch(() => undefined);
  }

  function swapCurrencies() {
    setPreferences((current) => ({
      ...current,
      baseCurrency: current.quoteCurrency,
      quoteCurrency: current.baseCurrency,
      alertMode: reverseMode(current.alertMode),
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }

  function updatePreference<K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  if (!fontsLoaded) {
    return (
      <View style={styles.fontLoader}>
        <StatusBar style="dark" />
        <ActivityIndicator color={COLORS.teal} size="small" />
      </View>
    );
  }

  const targetLabel = highMode ? '最高点' : '最低点';
  const targetBandLabel = highMode ? '最高' : '最低';
  const signalText = summary?.alert
    ? highMode ? '进入高位' : '进入低位'
    : '继续观察';
  const decisionText = summary
    ? summary.alert
      ? `当前汇率已进入近 ${preferences.lookbackDays} 天${highMode ? '高位' : '低位'}区间。`
      : `距离${targetLabel} ${summary.distanceFromTargetPct.toFixed(2)}%，尚未达到提醒条件。`
    : '正在读取最新参考汇率';

  return (
    <SafeAreaProvider>
      <LinearGradient colors={['#F8FAF7', COLORS.canvas, '#EAF0EC']} style={styles.app}>
        <StatusBar style="dark" />
        <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
          <View style={styles.header}>
            <View style={styles.brand}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>FX</Text>
              </View>
              <View>
                <Text style={styles.brandCode}>RATE / WATCH</Text>
                <Text style={styles.brandName}>汇率观察</Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel="刷新汇率"
              disabled={refreshing || loading}
              onPress={refreshRates}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.pressed,
                (refreshing || loading) && styles.disabled,
              ]}
            >
              <RefreshCw color={COLORS.ink} size={20} strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            contentInsetAdjustmentBehavior="automatic"
            refreshControl={(
              <RefreshControl
                colors={[COLORS.teal]}
                onRefresh={refreshRates}
                refreshing={refreshing}
                tintColor={COLORS.teal}
              />
            )}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              <View style={styles.pairSection}>
                <Text style={styles.eyebrow}>CURRENCY PAIR</Text>
                <View style={styles.pairRow}>
                  <CurrencyButton
                    code={preferences.baseCurrency}
                    label={baseName}
                    onPress={() => setPickerTarget('base')}
                  />
                  <Pressable
                    accessibilityLabel="对调货币"
                    onPress={swapCurrencies}
                    style={({ pressed }) => [styles.swapButton, pressed && styles.pressed]}
                  >
                    <ArrowLeftRight color={COLORS.white} size={19} strokeWidth={1.9} />
                  </Pressable>
                  <CurrencyButton
                    code={preferences.quoteCurrency}
                    label={quoteName}
                    onPress={() => setPickerTarget('quote')}
                  />
                </View>
              </View>

              {error ? (
                <Pressable onPress={refreshRates} style={styles.errorBanner}>
                  <WifiOff color={COLORS.coral} size={18} strokeWidth={1.9} />
                  <Text numberOfLines={2} style={styles.errorText}>{error}</Text>
                  <Text style={styles.retryText}>重试</Text>
                </Pressable>
              ) : null}

              <View style={styles.heroSection}>
                <View style={styles.heroMetaRow}>
                  <Text style={styles.heroDate}>
                    {summary ? `${formatRateDate(summary.date)} · 最新工作日` : '正在更新'}
                  </Text>
                  <View style={[
                    styles.signalPill,
                    summary?.alert ? styles.signalPillActive : styles.signalPillIdle,
                  ]}>
                    <View style={[
                      styles.signalDot,
                      { backgroundColor: summary?.alert ? COLORS.coral : COLORS.teal },
                    ]} />
                    <Text style={[
                      styles.signalText,
                      { color: summary?.alert ? COLORS.coral : COLORS.teal },
                    ]}>
                      {signalText}
                    </Text>
                  </View>
                </View>

                <Text style={styles.rateLead}>1 {preferences.baseCurrency}</Text>
                {summary ? (
                  <View style={styles.rateRow}>
                    <Text adjustsFontSizeToFit numberOfLines={1} style={styles.rateValue}>
                      {RATE_FORMATTER.format(summary.current)}
                    </Text>
                    <Text style={styles.rateQuote}>{preferences.quoteCurrency}</Text>
                  </View>
                ) : (
                  <View style={styles.rateLoading}>
                    <ActivityIndicator color={COLORS.teal} size="small" />
                  </View>
                )}
                <View style={[
                  styles.decisionBand,
                  summary?.alert ? styles.decisionBandActive : styles.decisionBandIdle,
                ]}>
                  {highMode ? (
                    <TrendingUp color={summary?.alert ? COLORS.coral : COLORS.teal} size={20} />
                  ) : (
                    <TrendingDown color={summary?.alert ? COLORS.coral : COLORS.teal} size={20} />
                  )}
                  <Text style={styles.decisionText}>{decisionText}</Text>
                </View>
              </View>

              <View style={styles.conversionSection}>
                <View style={styles.conversionInputBlock}>
                  <Text style={styles.fieldLabel}>{baseName}金额</Text>
                  <View style={styles.amountInputRow}>
                    <TextInput
                      accessibilityLabel={`${baseName}金额`}
                      keyboardType="decimal-pad"
                      maxLength={12}
                      onChangeText={(value) => updatePreference('amount', sanitizeAmount(value))}
                      selectTextOnFocus
                      style={styles.amountInput}
                      value={preferences.amount}
                    />
                    <Text style={styles.inputCurrency}>{preferences.baseCurrency}</Text>
                  </View>
                </View>
                <View style={styles.conversionResultBlock}>
                  <Text style={styles.fieldLabel}>约合 {quoteName}</Text>
                  <Text adjustsFontSizeToFit numberOfLines={1} style={styles.conversionResult}>
                    {summary ? MONEY_FORMATTER.format(convertedAmount) : '—'}
                  </Text>
                  <Text style={styles.resultCurrency}>{preferences.quoteCurrency}</Text>
                </View>
              </View>

              {summary ? (
                <View style={styles.metricsGrid}>
                  {[
                    ['区间最低', RATE_FORMATTER.format(summary.minimum)],
                    ['区间最高', RATE_FORMATTER.format(summary.maximum)],
                    ['区间平均', RATE_FORMATTER.format(summary.average)],
                    ['区间位置', `第 ${summary.percentile.toFixed(0)} 百分位`],
                  ].map(([label, value]) => (
                    <View key={label} style={styles.metricItem}>
                      <Text style={styles.metricLabel}>{label}</Text>
                      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.eyebrow}>HISTORY</Text>
                    <Text style={styles.sectionTitle}>参考汇率走势</Text>
                  </View>
                  <View style={styles.periodControl}>
                    {LOOKBACK_OPTIONS.map((days) => {
                      const selected = preferences.lookbackDays === days;
                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          key={days}
                          onPress={() => {
                            updatePreference('lookbackDays', days);
                            Haptics.selectionAsync().catch(() => undefined);
                          }}
                          style={[styles.periodButton, selected && styles.periodButtonActive]}
                        >
                          <Text style={[
                            styles.periodText,
                            selected && styles.periodTextActive,
                          ]}>
                            {days}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                {summary ? (
                  <RateChart
                    average={summary.average}
                    mode={preferences.alertMode}
                    rates={visibleRates}
                    width={chartWidth}
                  />
                ) : (
                  <View style={[styles.chartPlaceholder, { width: chartWidth }]}>
                    <ActivityIndicator color={COLORS.teal} size="small" />
                  </View>
                )}
                <View style={styles.chartLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendLine, { backgroundColor: COLORS.ink }]} />
                    <Text style={styles.legendText}>每日汇率</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendLine, { backgroundColor: COLORS.gold }]} />
                    <Text style={styles.legendText}>区间平均</Text>
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.eyebrow}>ALERT STRATEGY</Text>
                <Text style={styles.sectionTitle}>提醒方向</Text>
                <View style={styles.modeControl}>
                  {(['high', 'low'] as const).map((mode) => {
                    const selected = preferences.alertMode === mode;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={mode}
                        onPress={() => {
                          updatePreference('alertMode', mode);
                          Haptics.selectionAsync().catch(() => undefined);
                        }}
                        style={[styles.modeButton, selected && styles.modeButtonActive]}
                      >
                        {mode === 'high' ? (
                          <TrendingUp color={selected ? COLORS.white : COLORS.muted} size={18} />
                        ) : (
                          <TrendingDown color={selected ? COLORS.white : COLORS.muted} size={18} />
                        )}
                        <View>
                          <Text style={[styles.modeTitle, selected && styles.modeTextActive]}>
                            关注{mode === 'high' ? '高位' : '低位'}
                          </Text>
                          <Text style={[styles.modeCaption, selected && styles.modeCaptionActive]}>
                            {mode === 'high' ? '报价越高越好' : '报价越低越好'}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.rulePanel}>
                  <Stepper
                    decrementLabel="减少目标点容差"
                    incrementLabel="增加目标点容差"
                    label={`${targetLabel}容差`}
                    onDecrement={() => updatePreference(
                      'tolerancePct',
                      Math.max(0, Number((preferences.tolerancePct - 0.05).toFixed(2))),
                    )}
                    onIncrement={() => updatePreference(
                      'tolerancePct',
                      Math.min(5, Number((preferences.tolerancePct + 0.05).toFixed(2))),
                    )}
                    value={`${preferences.tolerancePct.toFixed(2)}%`}
                  />
                  <View style={styles.ruleDivider} />
                  <Stepper
                    decrementLabel="缩小百分位范围"
                    incrementLabel="扩大百分位范围"
                    label={`${targetBandLabel}百分位范围`}
                    onDecrement={() => updatePreference(
                      'percentileBand',
                      Math.max(5, preferences.percentileBand - 5),
                    )}
                    onIncrement={() => updatePreference(
                      'percentileBand',
                      Math.min(50, preferences.percentileBand + 5),
                    )}
                    value={`${preferences.percentileBand}%`}
                  />
                </View>
                <Text style={styles.ruleSummary}>
                  距离近 {preferences.lookbackDays} 天{targetLabel}不超过{' '}
                  {preferences.tolerancePct.toFixed(2)}%，或处于{targetBandLabel}{' '}
                  {preferences.percentileBand}% 时提醒。
                </Text>
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerText}>Frankfurter · ECB reference rates</Text>
                <Text style={styles.footerText}>
                  {fetchedAt
                    ? `本次更新 ${new Date(fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
                    : '参考汇率不含点差与手续费'}
                </Text>
              </View>
            </View>
          </ScrollView>

          <CurrencyPicker
            currencies={currencies}
            onClose={() => setPickerTarget(null)}
            onSelect={chooseCurrency}
            selectedCode={pickerTarget === 'base'
              ? preferences.baseCurrency
              : preferences.quoteCurrency}
            title={pickerTarget === 'base' ? '选择基准货币' : '选择报价货币'}
            visible={pickerTarget !== null}
          />
        </SafeAreaView>
      </LinearGradient>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  safeArea: { flex: 1 },
  fontLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.canvas,
  },
  header: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.line,
    backgroundColor: 'rgba(248, 250, 247, 0.94)',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    backgroundColor: COLORS.ink,
  },
  brandMarkText: {
    color: COLORS.white,
    fontFamily: FONTS.bold,
    fontSize: 14,
    letterSpacing: 0,
  },
  brandCode: {
    color: COLORS.muted,
    fontFamily: FONTS.semibold,
    fontSize: 9,
    letterSpacing: 0,
  },
  brandName: {
    marginTop: 1,
    color: COLORS.ink,
    fontFamily: FONTS.semibold,
    fontSize: 15,
    letterSpacing: 0,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
  },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 30 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  pairSection: { paddingTop: 24, paddingBottom: 22 },
  eyebrow: {
    color: COLORS.muted,
    fontFamily: FONTS.semibold,
    fontSize: 9,
    letterSpacing: 0,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  currencyButton: {
    minWidth: 0,
    height: 54,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
  },
  currencyButtonText: { minWidth: 0, flex: 1 },
  currencyCode: {
    color: COLORS.ink,
    fontFamily: FONTS.bold,
    fontSize: 15,
    letterSpacing: 0,
  },
  currencyLabel: {
    marginTop: 1,
    color: COLORS.muted,
    fontFamily: FONTS.regular,
    fontSize: 10,
  },
  swapButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: COLORS.ink,
  },
  errorBanner: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
    paddingHorizontal: 13,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.coral,
    backgroundColor: COLORS.coralSoft,
  },
  errorText: {
    flex: 1,
    color: '#873729',
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  retryText: { color: COLORS.coral, fontFamily: FONTS.semibold, fontSize: 12 },
  heroSection: { paddingTop: 4 },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroDate: {
    flex: 1,
    color: COLORS.muted,
    fontFamily: FONTS.medium,
    fontSize: 11,
  },
  signalPill: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 14,
  },
  signalPillActive: { borderColor: '#E8B4A9', backgroundColor: COLORS.coralSoft },
  signalPillIdle: { borderColor: '#B7DAD1', backgroundColor: COLORS.tealSoft },
  signalDot: { width: 6, height: 6, borderRadius: 3 },
  signalText: { fontFamily: FONTS.semibold, fontSize: 10 },
  rateLead: {
    marginTop: 24,
    color: COLORS.muted,
    fontFamily: FONTS.medium,
    fontSize: 15,
  },
  rateRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 2,
  },
  rateValue: {
    minWidth: 0,
    color: COLORS.ink,
    fontFamily: FONTS.semibold,
    fontSize: 52,
    lineHeight: 62,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  rateQuote: {
    paddingBottom: 10,
    color: COLORS.ink,
    fontFamily: FONTS.bold,
    fontSize: 14,
  },
  rateLoading: { height: 72, alignItems: 'flex-start', justifyContent: 'center' },
  decisionBand: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
  },
  decisionBandActive: { borderLeftColor: COLORS.coral, backgroundColor: COLORS.coralSoft },
  decisionBandIdle: { borderLeftColor: COLORS.teal, backgroundColor: COLORS.tealSoft },
  decisionText: {
    flex: 1,
    color: COLORS.ink,
    fontFamily: FONTS.medium,
    fontSize: 12,
    lineHeight: 18,
  },
  conversionSection: {
    flexDirection: 'row',
    gap: 18,
    paddingVertical: 28,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.lineStrong,
  },
  conversionInputBlock: { flex: 1 },
  conversionResultBlock: { flex: 1, alignItems: 'flex-end' },
  fieldLabel: { color: COLORS.muted, fontFamily: FONTS.regular, fontSize: 10 },
  amountInputRow: {
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.ink,
  },
  amountInput: {
    minWidth: 0,
    flex: 1,
    height: 45,
    padding: 0,
    color: COLORS.ink,
    fontFamily: FONTS.semibold,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
  },
  inputCurrency: { color: COLORS.ink, fontFamily: FONTS.bold, fontSize: 10 },
  conversionResult: {
    width: '100%',
    marginTop: 6,
    color: COLORS.ink,
    fontFamily: FONTS.semibold,
    fontSize: 24,
    lineHeight: 29,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  resultCurrency: {
    marginTop: 1,
    color: COLORS.muted,
    fontFamily: FONTS.bold,
    fontSize: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
  },
  metricItem: {
    width: '50%',
    minHeight: 74,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
    backgroundColor: 'rgba(255, 255, 255, 0.56)',
  },
  metricLabel: { color: COLORS.muted, fontFamily: FONTS.regular, fontSize: 10 },
  metricValue: {
    marginTop: 5,
    color: COLORS.ink,
    fontFamily: FONTS.semibold,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  section: { paddingTop: 42 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  sectionTitle: {
    marginTop: 4,
    color: COLORS.ink,
    fontFamily: FONTS.semibold,
    fontSize: 21,
    letterSpacing: 0,
  },
  periodControl: {
    height: 34,
    flexDirection: 'row',
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.64)',
  },
  periodButton: {
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
  },
  periodButtonActive: { backgroundColor: COLORS.ink },
  periodText: {
    color: COLORS.muted,
    fontFamily: FONTS.semibold,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  periodTextActive: { color: COLORS.white },
  chartPlaceholder: {
    height: 236,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 6,
    backgroundColor: COLORS.surface,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 18,
    marginTop: 11,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 18, height: 2 },
  legendText: { color: COLORS.muted, fontFamily: FONTS.regular, fontSize: 9 },
  modeControl: { flexDirection: 'row', gap: 8, marginTop: 16 },
  modeButton: {
    minHeight: 60,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
  },
  modeButtonActive: { borderColor: COLORS.ink, backgroundColor: COLORS.ink },
  modeTitle: { color: COLORS.ink, fontFamily: FONTS.semibold, fontSize: 12 },
  modeCaption: {
    marginTop: 2,
    color: COLORS.muted,
    fontFamily: FONTS.regular,
    fontSize: 8,
  },
  modeTextActive: { color: COLORS.white },
  modeCaptionActive: { color: '#BCC7C3' },
  rulePanel: {
    marginTop: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 6,
    backgroundColor: COLORS.surface,
  },
  stepperRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stepperLabel: {
    flex: 1,
    color: COLORS.ink,
    fontFamily: FONTS.medium,
    fontSize: 12,
  },
  stepperControl: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    borderRadius: 4,
    overflow: 'hidden',
  },
  stepperButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.canvas,
  },
  stepperValue: {
    minWidth: 62,
    color: COLORS.ink,
    fontFamily: FONTS.semibold,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  ruleDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.line },
  ruleSummary: {
    marginTop: 13,
    color: COLORS.muted,
    fontFamily: FONTS.regular,
    fontSize: 10,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 46,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.line,
  },
  footerText: {
    flex: 1,
    color: COLORS.muted,
    fontFamily: FONTS.regular,
    fontSize: 8,
  },
  pressed: { opacity: 0.64 },
  disabled: { opacity: 0.42 },
});
