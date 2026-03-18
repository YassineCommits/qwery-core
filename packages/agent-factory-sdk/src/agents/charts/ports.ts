import type { ChartType, ChartConfigTemplate } from '../types/chart.types';
import type { QueryResults } from '../tools/generate-chart';

export type SelectChartTypeInput = {
  queryResults: QueryResults;
  sqlQuery: string;
  userInput: string;
  analysisConsent?: {
    approved: boolean;
    limit?: number;
  };
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
  analysisConsent?: {
    approved: boolean;
    limit?: number;
  };
};

export interface ChartConfigTemplateGeneratorPort {
  generateTemplate(
    input: GenerateChartConfigTemplateInput,
  ): Promise<ChartConfigTemplate>;
}
