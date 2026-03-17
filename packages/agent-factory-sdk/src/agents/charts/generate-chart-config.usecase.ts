import type { ChartConfig, ChartType } from '../types/chart.types';
import { ChartConfigSchema } from '../types/chart.types';
import type { QueryResults } from '../tools/generate-chart';
import { evaluateChartData } from '../tools/chart-eval';
import { getSupportedChartTypes } from '../config/supported-charts';
import { getLogger } from '@qwery/shared/logger';
import type {
  ChartConfigTemplateGeneratorPort,
  ChartTypeSelectorPort,
} from './ports';

export type GenerateChartConfigUseCaseInput = {
  queryResults: QueryResults;
  sqlQuery: string;
  userInput: string;
  chartType?: ChartType;
};

export class GenerateChartConfigUseCase {
  constructor(
    private readonly deps: {
      chartTypeSelector: ChartTypeSelectorPort;
      chartConfigTemplateGenerator: ChartConfigTemplateGeneratorPort;
    },
  ) {}

  async execute(input: GenerateChartConfigUseCaseInput): Promise<ChartConfig> {
    const selection = input.chartType
      ? null
      : await this.safeSelectChartType({
          queryResults: input.queryResults,
          sqlQuery: input.sqlQuery,
          userInput: input.userInput,
        });

    const chartType = input.chartType ?? selection?.chartType ?? 'bar';

    const template =
      await this.deps.chartConfigTemplateGenerator.generateTemplate({
        chartType,
        queryResults: input.queryResults,
        sqlQuery: input.sqlQuery,
      });

    const data = evaluateChartData(
      chartType,
      input.queryResults,
      template.config,
    );

    const chartConfig = ChartConfigSchema.parse({
      chartType: template.chartType,
      title: template.title,
      data,
      config: template.config,
      renderEngine: 'recharts',
    });

    this.healKeys(chartType, chartConfig);

    return chartConfig;
  }

  private async safeSelectChartType(input: {
    queryResults: QueryResults;
    sqlQuery: string;
    userInput: string;
  }): Promise<{ chartType: ChartType; reasoningText: string }> {
    try {
      const result = await this.deps.chartTypeSelector.select(input);
      return result;
    } catch (error) {
      const logger = await getLogger();
      logger.error(
        '[GenerateChartConfigUseCase] selectChartType ERROR:',
        error,
      );
      const supportedTypes = getSupportedChartTypes();
      const fallbackType = supportedTypes[0] || 'bar';
      return {
        chartType: fallbackType,
        reasoningText: `Failed to analyze chart type, defaulting to ${fallbackType} chart`,
      };
    }
  }

  private healKeys(chartType: ChartType, chartConfig: ChartConfig) {
    const [firstRow] = chartConfig.data;
    if (!firstRow || typeof firstRow !== 'object') return;

    const availableKeys = Object.keys(firstRow);

    if (
      chartType === 'bar' ||
      chartType === 'line' ||
      chartType === 'area' ||
      chartType === 'scatter'
    ) {
      const xKey = chartConfig.config.xKey ?? 'name';
      const yKey = chartConfig.config.yKey ?? 'value';

      const hasXKey = availableKeys.includes(xKey);
      const hasYKey = availableKeys.includes(yKey);

      if (!hasXKey || !hasYKey) {
        const altXKey =
          availableKeys.find((key) => {
            const lower = key.toLowerCase();
            return (
              lower.includes('name') ||
              lower.includes('category') ||
              lower.includes('label')
            );
          }) ?? availableKeys[0];

        const altYKey =
          availableKeys.find((key) => {
            const lower = key.toLowerCase();
            return (
              lower.includes('value') ||
              lower.includes('count') ||
              lower.includes('amount')
            );
          }) ??
          availableKeys[1] ??
          availableKeys[0];

        if (altXKey && altYKey && altXKey !== altYKey) {
          chartConfig.config.xKey = chartConfig.config.xKey || altXKey;
          chartConfig.config.yKey = chartConfig.config.yKey || altYKey;
        }
      }
    }

    if (chartType === 'pie' || chartType === 'donut') {
      const nameKey = chartConfig.config.nameKey ?? 'name';
      const valueKey = chartConfig.config.valueKey ?? 'value';

      const hasNameKey = availableKeys.includes(nameKey);
      const hasValueKey = availableKeys.includes(valueKey);

      if (!hasNameKey || !hasValueKey) {
        const altNameKey =
          availableKeys.find((key) => {
            const lower = key.toLowerCase();
            return (
              lower.includes('name') ||
              lower.includes('category') ||
              lower.includes('label')
            );
          }) ?? availableKeys[0];

        const altValueKey =
          availableKeys.find((key) => {
            const lower = key.toLowerCase();
            return (
              lower.includes('value') ||
              lower.includes('count') ||
              lower.includes('amount')
            );
          }) ??
          availableKeys[1] ??
          availableKeys[0];

        if (altNameKey && altValueKey && altNameKey !== altValueKey) {
          chartConfig.config.nameKey = chartConfig.config.nameKey || altNameKey;
          chartConfig.config.valueKey =
            chartConfig.config.valueKey || altValueKey;
        }
      }
    }
  }
}
