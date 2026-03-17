import { describe, it, expect } from 'vitest';
import { VegaLiteSpecFactory } from '../vega/spec-factory';
import type { VegaChartInput } from '../vega/types';

describe('VegaLiteSpecFactory (new chart types)', () => {
  const factory = new VegaLiteSpecFactory();

  it('builds a scatter spec', () => {
    const chartConfig: VegaChartInput = {
      chartType: 'scatter',
      title: 'X vs Y',
      data: [
        { x: 1, y: 2 },
        { x: 2, y: 3 },
      ],
      config: {
        colors: ['#123456'],
        labels: { x: 'X', y: 'Y' },
        xKey: 'x',
        yKey: 'y',
      },
    };

    const spec = factory.createSpec(chartConfig);
    expect((spec.mark as { type: string }).type).toBe('point');
    const encoding = spec.encoding as {
      x?: { field?: string };
      y?: { field?: string };
    };
    expect(encoding.x?.field).toBe('x');
    expect(encoding.y?.field).toBe('y');
  });

  it('builds a histogram spec', () => {
    const chartConfig: VegaChartInput = {
      chartType: 'histogram',
      title: 'Value distribution',
      data: [{ value: 1 }, { value: 2 }, { value: 2 }, { value: 3 }],
      config: {
        colors: ['#123456'],
        labels: { value: 'Value' },
        xKey: 'value',
      },
    };

    const spec = factory.createSpec(chartConfig);
    expect(spec.mark).toBe('bar');
    const encoding = spec.encoding as {
      x?: { field?: string; bin?: boolean };
      y?: { aggregate?: string };
    };
    expect(encoding.x?.field).toBe('value');
    expect(encoding.x?.bin).toBe(true);
    expect(encoding.y?.aggregate).toBe('count');
  });

  it('builds a heatmap spec', () => {
    const chartConfig: VegaChartInput = {
      chartType: 'heatmap',
      title: 'Heat',
      data: [
        { day: 'Mon', hour: '10', count: 5 },
        { day: 'Mon', hour: '11', count: 8 },
      ],
      config: {
        colors: ['#123456'],
        labels: { day: 'Day', hour: 'Hour', count: 'Count' },
        xKey: 'day',
        yKey: 'hour',
        valueKey: 'count',
      },
    };

    const spec = factory.createSpec(chartConfig);
    expect(spec.mark).toBe('rect');
    const encoding = spec.encoding as {
      x?: { field?: string };
      y?: { field?: string };
      color?: { field?: string };
    };
    expect(encoding.x?.field).toBe('day');
    expect(encoding.y?.field).toBe('hour');
    expect(encoding.color?.field).toBe('count');
  });

  it('builds a grouped_bar spec', () => {
    const chartConfig: VegaChartInput = {
      chartType: 'grouped_bar',
      title: 'Grouped',
      data: [
        { product: 'A', segment: 'S1', sales: 10 },
        { product: 'A', segment: 'S2', sales: 20 },
      ],
      config: {
        colors: ['#123456'],
        labels: { product: 'Product', segment: 'Segment', sales: 'Sales' },
        xKey: 'product',
        yKey: 'sales',
        seriesKey: 'segment',
      },
    };

    const spec = factory.createSpec(chartConfig);
    expect(spec.mark).toBe('bar');
    const encoding = spec.encoding as {
      x?: { field?: string };
      xOffset?: { field?: string };
      y?: { field?: string };
    };
    expect(encoding.x?.field).toBe('product');
    expect(encoding.xOffset?.field).toBe('segment');
    expect(encoding.y?.field).toBe('sales');
  });

  it('builds a stacked_bar spec', () => {
    const chartConfig: VegaChartInput = {
      chartType: 'stacked_bar',
      title: 'Stacked',
      data: [
        { product: 'A', segment: 'S1', sales: 10 },
        { product: 'A', segment: 'S2', sales: 20 },
      ],
      config: {
        colors: ['#123456'],
        labels: { product: 'Product', segment: 'Segment', sales: 'Sales' },
        xKey: 'product',
        yKey: 'sales',
        seriesKey: 'segment',
      },
    };

    const spec = factory.createSpec(chartConfig);
    expect(spec.mark).toBe('bar');
    const encoding = spec.encoding as {
      y?: { stack?: string };
      color?: { field?: string };
    };
    expect(encoding.y?.stack).toBe('zero');
    expect(encoding.color?.field).toBe('segment');
  });

  it('builds an area spec', () => {
    const chartConfig: VegaChartInput = {
      chartType: 'area',
      title: 'Area',
      data: [
        { date: '2024-01-01', value: 1 },
        { date: '2024-01-02', value: 2 },
      ],
      config: {
        colors: ['#123456'],
        labels: { date: 'Date', value: 'Value' },
        xKey: 'date',
        yKey: 'value',
      },
    };

    const spec = factory.createSpec(chartConfig);
    expect((spec.mark as { type?: string }).type).toBe('area');
    const encoding = spec.encoding as {
      x?: { field?: string };
      y?: { field?: string };
    };
    expect(encoding.x?.field).toBe('date');
    expect(encoding.y?.field).toBe('value');
  });

  it('builds a donut spec', () => {
    const chartConfig: VegaChartInput = {
      chartType: 'donut',
      title: 'Donut',
      data: [
        { name: 'A', value: 10 },
        { name: 'B', value: 20 },
      ],
      config: {
        colors: ['#123456'],
        labels: { name: 'Name', value: 'Value' },
        nameKey: 'name',
        valueKey: 'value',
      },
    };

    const spec = factory.createSpec(chartConfig);
    const mark = spec.mark as { type?: string; innerRadius?: number };
    expect(mark.type).toBe('arc');
    expect(mark.innerRadius).toBe(50);
  });
});
