import { useState } from 'react';
import {
  GestureResponderEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { COLORS, FONTS } from '../constants';
import type { AlertMode, RatePoint } from '../types';

interface RateChartProps {
  average: number;
  mode: AlertMode;
  rates: RatePoint[];
  width: number;
}

const HEIGHT = 236;
const MARGIN = { top: 18, right: 14, bottom: 31, left: 47 };

function shortDate(date: string): string {
  return date.slice(5).replace('-', '/');
}

export function RateChart({ average, mode, rates, width }: RateChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const chartWidth = Math.max(width, 280);
  const plotWidth = chartWidth - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const values = rates.map(({ rate }) => rate);
  const rawMinimum = Math.min(...values);
  const rawMaximum = Math.max(...values);
  const rangePadding = Math.max((rawMaximum - rawMinimum) * 0.14, 0.0002);
  const minimum = rawMinimum - rangePadding;
  const maximum = rawMaximum + rangePadding;
  const step = plotWidth / Math.max(rates.length - 1, 1);
  const xFor = (index: number) => MARGIN.left + index * step;
  const yFor = (rate: number) =>
    MARGIN.top + ((maximum - rate) / (maximum - minimum)) * plotHeight;
  const points = rates.map((point, index) => ({
    ...point,
    x: xFor(index),
    y: yFor(point.rate),
  }));
  const linePath = points
    .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x},${y}`)
    .join(' ');
  const areaPath = `${linePath} L${points.at(-1)?.x},${HEIGHT - MARGIN.bottom} ` +
    `L${points[0]?.x},${HEIGHT - MARGIN.bottom} Z`;
  const activeIndex = selectedIndex ?? rates.length - 1;
  const activePoint = points[activeIndex];
  const targetColor = mode === 'high' ? COLORS.teal : COLORS.coral;

  function selectPoint(event: GestureResponderEvent) {
    const relativeX = event.nativeEvent.locationX - MARGIN.left;
    const index = Math.round(relativeX / Math.max(step, 1));
    setSelectedIndex(Math.max(0, Math.min(rates.length - 1, index)));
  }

  const labelIndexes = [...new Set([
    0,
    Math.floor((rates.length - 1) / 2),
    rates.length - 1,
  ])];
  const tooltipLeft = Math.min(
    Math.max(activePoint.x - 56, 4),
    chartWidth - 116,
  );
  const tooltipTop = Math.max(activePoint.y - 58, 4);

  return (
    <View
      accessibilityLabel="历史汇率走势图，滑动查看每日汇率"
      accessibilityRole="image"
      onMoveShouldSetResponder={() => true}
      onResponderGrant={selectPoint}
      onResponderMove={selectPoint}
      onStartShouldSetResponder={() => true}
      style={[styles.container, { width: chartWidth }]}
    >
      <Svg height={HEIGHT} style={styles.nonInteractive} width={chartWidth}>
        <Defs>
          <SvgLinearGradient id="rateFill" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={targetColor} stopOpacity="0.24" />
            <Stop offset="1" stopColor={targetColor} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>

        {[0, 1, 2, 3].map((index) => {
          const ratio = index / 3;
          const y = MARGIN.top + ratio * plotHeight;
          const value = maximum - ratio * (maximum - minimum);
          return (
            <G key={index}>
              <Line
                stroke={COLORS.line}
                strokeWidth={1}
                x1={MARGIN.left}
                x2={chartWidth - MARGIN.right}
                y1={y}
                y2={y}
              />
              <SvgText
                fill={COLORS.muted}
                fontFamily={FONTS.medium}
                fontSize={9}
                textAnchor="end"
                x={MARGIN.left - 8}
                y={y + 3}
              >
                {value.toFixed(4)}
              </SvgText>
            </G>
          );
        })}

        <Path d={areaPath} fill="url(#rateFill)" />
        <Line
          stroke={COLORS.gold}
          strokeDasharray="5 5"
          strokeWidth={1.5}
          x1={MARGIN.left}
          x2={chartWidth - MARGIN.right}
          y1={yFor(average)}
          y2={yFor(average)}
        />
        <Path
          d={linePath}
          fill="none"
          stroke={COLORS.ink}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
        />

        {selectedIndex !== null ? (
          <Line
            stroke={COLORS.lineStrong}
            strokeDasharray="3 4"
            strokeWidth={1}
            x1={activePoint.x}
            x2={activePoint.x}
            y1={MARGIN.top}
            y2={HEIGHT - MARGIN.bottom}
          />
        ) : null}
        <Circle
          cx={activePoint.x}
          cy={activePoint.y}
          fill={COLORS.surface}
          r={4.5}
          stroke={targetColor}
          strokeWidth={2.5}
        />

        {labelIndexes.map((index) => (
          <SvgText
            fill={COLORS.muted}
            fontFamily={FONTS.medium}
            fontSize={9}
            key={index}
            textAnchor={index === 0 ? 'start' : index === rates.length - 1 ? 'end' : 'middle'}
            x={xFor(index)}
            y={HEIGHT - 10}
          >
            {shortDate(rates[index].date)}
          </SvgText>
        ))}
      </Svg>

      {selectedIndex !== null ? (
        <View pointerEvents="none" style={[styles.tooltip, { left: tooltipLeft, top: tooltipTop }]}>
          <Text style={styles.tooltipDate}>{activePoint.date}</Text>
          <Text style={styles.tooltipRate}>{activePoint.rate.toFixed(5)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: HEIGHT,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 6,
    backgroundColor: COLORS.surface,
  },
  nonInteractive: {
    pointerEvents: 'none',
  },
  tooltip: {
    position: 'absolute',
    width: 112,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 4,
    backgroundColor: COLORS.ink,
  },
  tooltipDate: {
    color: '#BAC7C2',
    fontFamily: FONTS.medium,
    fontSize: 9,
  },
  tooltipRate: {
    marginTop: 2,
    color: COLORS.white,
    fontFamily: FONTS.semibold,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});