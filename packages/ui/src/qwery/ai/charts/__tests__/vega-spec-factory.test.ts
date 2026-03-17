import { describe, it, expect } from 'vitest';
import { VegaLiteSpecFactory } from '../vega/spec-factory';
import type { VegaChartInput } from '../vega/types';

describe('VegaLiteSpecFactory', () => {
  it('builds a bar chart spec for product/sales example', () => {
    const factory = new VegaLiteSpecFactory();

    const chartConfig: VegaChartInput = {
      chartType: 'bar',
      title: 'Sales per Product',
      data: [
        { product: 'A', sales: 120 },
        { product: 'B', sales: 80 },
      ],
      config: {
        colors: ['#123456'],
        labels: {
          product: 'Product',
          sales: 'Sales',
        },
        xKey: 'product',
        yKey: 'sales',
      },
    };

    const spec = factory.createSpec(chartConfig);

    const encoding = spec.encoding as {
      x: { field: string; type: string };
      y: { field: string; type: string };
    };

    expect(encoding.x.field).toBe('product');
    expect(encoding.x.type).toBe('nominal');
    expect(encoding.y.field).toBe('sales');
    expect(encoding.y.type).toBe('quantitative');

    const data = (spec.data as { values: Array<Record<string, unknown>> })
      .values;
    expect(data).toEqual(chartConfig.data);
  });
});
