import { resolveChartKeys, DEFAULT_CHART_COLORS } from '../chart-utils';
import type { ChartConfig } from './types';
import type { VegaLiteSpec } from './types';
import { renderTemplate } from './mustache-engine';
import {
  BAR_CHART_SPEC_TEMPLATE,
  LINE_CHART_SPEC_TEMPLATE,
  PIE_CHART_SPEC_TEMPLATE,
} from './templates';

type ChartType = ChartConfig['chartType'];

type BarLikeConfig = Extract<ChartConfig, { chartType: 'bar' | 'line' }>;
type PieConfig = Extract<ChartConfig, { chartType: 'pie' }>;

function getSafeTitle(title?: string): string {
  return title && title.trim().length > 0 ? title : '';
}

function getColorsOrDefault(colors: string[] | undefined): string[] {
  if (colors && colors.length > 0) {
    return colors;
  }
  return DEFAULT_CHART_COLORS;
}

function buildBarLikeSpec(
  config: BarLikeConfig,
  chartType: 'bar' | 'line',
): VegaLiteSpec {
  const { data, title, config: rawConfig } = config;
  const colors = getColorsOrDefault(rawConfig.colors);

  const resolved = resolveChartKeys(
    data,
    { xKey: rawConfig.xKey, yKey: rawConfig.yKey },
    chartType,
  ) as { xKey: string; yKey: string };

  const { xKey, yKey } = resolved;
  const labels = rawConfig.labels ?? {};

  const xLabel = labels[xKey] ?? labels.name ?? xKey;
  const yLabel = labels[yKey] ?? labels.value ?? 'Value';

  const template =
    chartType === 'bar' ? BAR_CHART_SPEC_TEMPLATE : LINE_CHART_SPEC_TEMPLATE;

  const context = {
    title: getSafeTitle(title),
    dataJson: JSON.stringify(data),
    xField: xKey,
    yField: yKey,
    xLabel,
    yLabel,
    primaryColor: colors[0] ?? DEFAULT_CHART_COLORS[0],
  };

  const rendered = renderTemplate(template, context);
  return JSON.parse(rendered) as VegaLiteSpec;
}

function buildPieSpec(config: PieConfig): VegaLiteSpec {
  const { data, title, config: rawConfig } = config;
  const colors = getColorsOrDefault(rawConfig.colors);

  const resolved = resolveChartKeys(
    data,
    { nameKey: rawConfig.nameKey, valueKey: rawConfig.valueKey },
    'pie',
  ) as { nameKey: string; valueKey: string };

  const { nameKey, valueKey } = resolved;
  const labels = rawConfig.labels ?? {};

  const categoryLabel = labels[nameKey] ?? labels.name ?? 'Category';
  const valueLabel = labels[valueKey] ?? labels.value ?? 'Value';

  const context = {
    title: getSafeTitle(title),
    dataJson: JSON.stringify(data),
    categoryField: nameKey,
    valueField: valueKey,
    categoryLabel,
    valueLabel,
    colorsJson: JSON.stringify(colors),
  };

  const rendered = renderTemplate(PIE_CHART_SPEC_TEMPLATE, context);
  return JSON.parse(rendered) as VegaLiteSpec;
}

export class VegaLiteSpecFactory {
  createSpec(config: ChartConfig): VegaLiteSpec {
    const chartType: ChartType = config.chartType;

    if (!Array.isArray(config.data) || config.data.length === 0) {
      return {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        description: 'Empty dataset – nothing to render',
        data: { values: [] },
      };
    }

    switch (chartType) {
      case 'bar':
        return buildBarLikeSpec(
          config as BarLikeConfig & { chartType: 'bar' },
          'bar',
        );
      case 'line':
        return buildBarLikeSpec(
          config as BarLikeConfig & { chartType: 'line' },
          'line',
        );
      case 'pie':
        return buildPieSpec(config as PieConfig);
      default:
        return {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          description: `Unsupported chart type: ${String(chartType)}`,
          data: { values: config.data },
        };
    }
  }
}
