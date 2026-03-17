import { resolveChartKeys, DEFAULT_CHART_COLORS } from '../chart-utils';
import type { ChartConfig } from './types';
import type { VegaLiteSpec } from './types';
import { renderTemplate } from './mustache-engine';
import {
  BAR_CHART_SPEC_TEMPLATE,
  LINE_CHART_SPEC_TEMPLATE,
  PIE_CHART_SPEC_TEMPLATE,
  DONUT_CHART_SPEC_TEMPLATE,
  AREA_CHART_SPEC_TEMPLATE,
  SCATTER_SPEC_TEMPLATE,
  SCATTER_WITH_SERIES_SPEC_TEMPLATE,
  HISTOGRAM_SPEC_TEMPLATE,
  HEATMAP_SPEC_TEMPLATE,
  GROUPED_BAR_SPEC_TEMPLATE,
  STACKED_BAR_SPEC_TEMPLATE,
} from './templates';

type ChartType = ChartConfig['chartType'];

type PieLikeChartType = 'pie' | 'donut';
type BarLikeChartType = 'bar' | 'line' | 'area';
type MultiSeriesBarChartType = 'grouped_bar' | 'stacked_bar';

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
  config: ChartConfig,
  chartType: BarLikeChartType,
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

  // Phase 1 variant: for bar/line/area, if seriesKey is present we produce a grouped style
  // Vega-Lite spec that uses color for the series dimension.
  const seriesField = rawConfig.seriesKey;
  const seriesLabel = seriesField
    ? (labels[seriesField] ?? 'Series')
    : undefined;

  const template =
    chartType === 'bar'
      ? seriesField
        ? GROUPED_BAR_SPEC_TEMPLATE
        : BAR_CHART_SPEC_TEMPLATE
      : chartType === 'area'
        ? AREA_CHART_SPEC_TEMPLATE
        : seriesField
          ? SCATTER_WITH_SERIES_SPEC_TEMPLATE.replace(
              '"type": "point"',
              '"type": "line", "point": true',
            )
          : LINE_CHART_SPEC_TEMPLATE;

  const context = {
    title: getSafeTitle(title),
    dataJson: JSON.stringify(data),
    xField: xKey,
    yField: yKey,
    xLabel,
    yLabel,
    primaryColor: colors[0] ?? DEFAULT_CHART_COLORS[0],
    seriesField,
    seriesLabel,
  };

  const rendered = renderTemplate(template, context);
  return JSON.parse(rendered) as VegaLiteSpec;
}

function buildPieSpec(
  config: ChartConfig & { chartType: PieLikeChartType },
): VegaLiteSpec {
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

  const template =
    config.chartType === 'donut'
      ? DONUT_CHART_SPEC_TEMPLATE
      : PIE_CHART_SPEC_TEMPLATE;

  const rendered = renderTemplate(template, context);
  return JSON.parse(rendered) as VegaLiteSpec;
}

function buildScatterSpec(config: ChartConfig): VegaLiteSpec {
  const { data, title, config: rawConfig } = config;
  const colors = getColorsOrDefault(rawConfig.colors);
  const labels = rawConfig.labels ?? {};

  const resolved = resolveChartKeys(
    data,
    { xKey: rawConfig.xKey, yKey: rawConfig.yKey },
    'bar',
  ) as { xKey: string; yKey: string };

  const xLabel = labels[resolved.xKey] ?? resolved.xKey;
  const yLabel = labels[resolved.yKey] ?? resolved.yKey;

  const seriesField = rawConfig.seriesKey;
  const seriesLabel = seriesField
    ? (labels[seriesField] ?? 'Series')
    : 'Series';

  const template = seriesField
    ? SCATTER_WITH_SERIES_SPEC_TEMPLATE
    : SCATTER_SPEC_TEMPLATE;

  const context = {
    title: getSafeTitle(title),
    dataJson: JSON.stringify(data),
    xField: resolved.xKey,
    yField: resolved.yKey,
    xLabel,
    yLabel,
    primaryColor: colors[0] ?? DEFAULT_CHART_COLORS[0],
    seriesField,
    seriesLabel,
  };

  return JSON.parse(renderTemplate(template, context)) as VegaLiteSpec;
}

function buildHistogramSpec(config: ChartConfig): VegaLiteSpec {
  const { data, title, config: rawConfig } = config;
  const colors = getColorsOrDefault(rawConfig.colors);
  const labels = rawConfig.labels ?? {};

  // Histogram uses xKey only; fall back to a best-effort guess (reuse resolver).
  const resolved = resolveChartKeys(
    data,
    { xKey: rawConfig.xKey, yKey: undefined },
    'bar',
  ) as { xKey: string; yKey: string };

  const xField = rawConfig.xKey ?? resolved.xKey;
  const xLabel = labels[xField] ?? labels.value ?? xField;

  const context = {
    title: getSafeTitle(title),
    dataJson: JSON.stringify(data),
    xField,
    xLabel,
    primaryColor: colors[0] ?? DEFAULT_CHART_COLORS[0],
  };

  return JSON.parse(
    renderTemplate(HISTOGRAM_SPEC_TEMPLATE, context),
  ) as VegaLiteSpec;
}

function inferVegaType(value: unknown): 'nominal' | 'quantitative' {
  return typeof value === 'number' ? 'quantitative' : 'nominal';
}

function buildHeatmapSpec(config: ChartConfig): VegaLiteSpec {
  const { data, title, config: rawConfig } = config;
  const labels = rawConfig.labels ?? {};

  const first = data[0] ?? {};
  const allKeys = Object.keys(first);

  const xField = rawConfig.xKey ?? allKeys[0] ?? 'x';
  const yField = rawConfig.yKey ?? allKeys[1] ?? 'y';
  const valueField = rawConfig.valueKey ?? allKeys[2] ?? 'value';

  const xType = inferVegaType((first as Record<string, unknown>)[xField]);
  const yType = inferVegaType((first as Record<string, unknown>)[yField]);

  const context = {
    title: getSafeTitle(title),
    dataJson: JSON.stringify(data),
    xField,
    yField,
    valueField,
    xType,
    yType,
    xLabel: labels[xField] ?? xField,
    yLabel: labels[yField] ?? yField,
    valueLabel: labels[valueField] ?? labels.value ?? 'Value',
  };

  return JSON.parse(
    renderTemplate(HEATMAP_SPEC_TEMPLATE, context),
  ) as VegaLiteSpec;
}

function buildMultiSeriesBarSpec(
  config: ChartConfig & { chartType: MultiSeriesBarChartType },
): VegaLiteSpec {
  const { data, title, config: rawConfig } = config;
  const labels = rawConfig.labels ?? {};

  const first = data[0] ?? {};
  const allKeys = Object.keys(first);

  const xField = rawConfig.xKey ?? allKeys[0] ?? 'category';
  const yField = rawConfig.yKey ?? allKeys[1] ?? 'value';
  const seriesField = rawConfig.seriesKey ?? allKeys[2] ?? 'series';

  const context = {
    title: getSafeTitle(title),
    dataJson: JSON.stringify(data),
    xField,
    yField,
    seriesField,
    xLabel: labels[xField] ?? labels.name ?? xField,
    yLabel: labels[yField] ?? labels.value ?? 'Value',
    seriesLabel: labels[seriesField] ?? 'Series',
  };

  const template =
    config.chartType === 'stacked_bar'
      ? STACKED_BAR_SPEC_TEMPLATE
      : GROUPED_BAR_SPEC_TEMPLATE;

  return JSON.parse(renderTemplate(template, context)) as VegaLiteSpec;
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
        return buildBarLikeSpec(config, 'bar');
      case 'line':
        return buildBarLikeSpec(config, 'line');
      case 'area':
        return buildBarLikeSpec(config, 'area');
      case 'pie':
        return buildPieSpec(config as ChartConfig & { chartType: 'pie' });
      case 'donut':
        return buildPieSpec(config as ChartConfig & { chartType: 'donut' });
      case 'scatter':
        return buildScatterSpec(config);
      case 'histogram':
        return buildHistogramSpec(config);
      case 'heatmap':
        return buildHeatmapSpec(config);
      case 'grouped_bar':
      case 'stacked_bar':
        return buildMultiSeriesBarSpec(
          config as ChartConfig & { chartType: 'grouped_bar' | 'stacked_bar' },
        );
      default:
        return {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          description: `Unsupported chart type: ${String(chartType)}`,
          data: { values: config.data },
        };
    }
  }
}
