import { describe, it, expect, vi } from 'vitest';
import { GenerateChartConfigUseCase } from '../generate-chart-config.usecase';
import type {
  ChartConfigTemplateGeneratorPort,
  ChartTypeSelectorPort,
} from '../ports';

describe('GenerateChartConfigUseCase', () => {
  it('skips selection when chartType is provided', async () => {
    const chartTypeSelector: ChartTypeSelectorPort = {
      select: vi.fn(),
    };

    const chartConfigTemplateGenerator: ChartConfigTemplateGeneratorPort = {
      generateTemplate: vi.fn().mockResolvedValue({
        chartType: 'bar',
        title: 'Test',
        config: {
          colors: ['#000000'],
          labels: { product: 'Product', sales: 'Sales' },
          xKey: 'product',
          yKey: 'sales',
        },
      }),
    };

    const useCase = new GenerateChartConfigUseCase({
      chartTypeSelector,
      chartConfigTemplateGenerator,
    });

    const result = await useCase.execute({
      chartType: 'bar',
      sqlQuery: 'select 1',
      userInput: 'bar please',
      queryResults: {
        columns: ['product', 'sales'],
        rows: [
          { product: 'A', sales: 120 },
          { product: 'B', sales: 80 },
        ],
      },
    });

    expect(chartTypeSelector.select).not.toHaveBeenCalled();
    expect(chartConfigTemplateGenerator.generateTemplate).toHaveBeenCalledTimes(
      1,
    );
    expect(result.chartType).toBe('bar');
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('uses selection when chartType is not provided', async () => {
    const chartTypeSelector: ChartTypeSelectorPort = {
      select: vi.fn().mockResolvedValue({
        chartType: 'scatter',
        reasoningText: 'Two numeric columns',
      }),
    };

    const chartConfigTemplateGenerator: ChartConfigTemplateGeneratorPort = {
      generateTemplate: vi.fn().mockResolvedValue({
        chartType: 'scatter',
        title: 'X vs Y',
        config: {
          colors: ['#000000'],
          labels: { x: 'X', y: 'Y' },
          xKey: 'x',
          yKey: 'y',
        },
      }),
    };

    const useCase = new GenerateChartConfigUseCase({
      chartTypeSelector,
      chartConfigTemplateGenerator,
    });

    const result = await useCase.execute({
      sqlQuery: 'select x,y from t',
      userInput: 'show relation',
      queryResults: {
        columns: ['x', 'y'],
        rows: [
          { x: 1, y: 2 },
          { x: 2, y: 3 },
        ],
      },
    });

    expect(chartTypeSelector.select).toHaveBeenCalledTimes(1);
    expect(chartConfigTemplateGenerator.generateTemplate).toHaveBeenCalledTimes(
      1,
    );
    expect(result.chartType).toBe('scatter');
  });
});
