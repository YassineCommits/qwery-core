import type { ChartConfig as ChartRendererConfig } from '../../chart-renderer';
import type { VegaChartInput } from '../types';

export function fromChartRendererConfig(
  chartConfig: ChartRendererConfig,
): VegaChartInput {
  return {
    chartType: chartConfig.chartType,
    title: chartConfig.title,
    data: chartConfig.data,
    config: chartConfig.config,
  };
}
