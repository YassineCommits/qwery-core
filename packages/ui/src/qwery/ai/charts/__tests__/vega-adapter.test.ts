import { describe, it, expect } from 'vitest';
import { fromChartRendererConfig } from '../vega/adapters/from-chart-renderer';
import type { ChartConfig } from '../chart-renderer';

describe('fromChartRendererConfig', () => {
  it('maps ChartRenderer config to VegaChartInput', () => {
    const chartConfig: ChartConfig = {
      chartType: 'bar',
      title: 'Test',
      data: [{ product: 'A', sales: 1 }],
      config: {
        colors: ['#000000'],
        labels: { product: 'Product', sales: 'Sales' },
        xKey: 'product',
        yKey: 'sales',
      },
    };

    const mapped = fromChartRendererConfig(chartConfig);
    expect(mapped.chartType).toBe('bar');
    expect(mapped.title).toBe('Test');
    expect(mapped.data).toEqual(chartConfig.data);
    expect(mapped.config.xKey).toBe('product');
  });
});
