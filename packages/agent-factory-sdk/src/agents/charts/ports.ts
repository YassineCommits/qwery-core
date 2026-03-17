import type { ChartType, ChartConfigTemplate } from '../types/chart.types';
import type { QueryResults } from '../tools/generate-chart';

export type SelectChartTypeInput = {
  queryResults: QueryResults;
  sqlQuery: string;
  userInput: string;
};

export type SelectChartTypeOutput = {
  chartType: ChartType;
  reasoningText: string;
};

export interface ChartTypeSelectorPort {
  select(input: SelectChartTypeInput): Promise<SelectChartTypeOutput>;
}

export type GenerateChartConfigTemplateInput = {
  chartType: ChartType;
  queryResults: QueryResults;
  sqlQuery: string;
};

export interface ChartConfigTemplateGeneratorPort {
  generateTemplate(
    input: GenerateChartConfigTemplateInput,
  ): Promise<ChartConfigTemplate>;
}
