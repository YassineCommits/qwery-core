import type {
  ChartType,
  ChartConfig,
  ChartConfigTemplate,
} from '../types/chart.types';
import { GenerateChartConfigUseCase } from '../charts/generate-chart-config.usecase';
import {
  AiSdkChartConfigTemplateGenerator,
  AiSdkChartTypeSelector,
} from '../charts/adapters/ai-chart-ports';
import { getSupportedChartTypes } from '../config/supported-charts';
import { getLogger } from '@qwery/shared/logger';

export interface QueryResults {
  rows: Array<Record<string, unknown>>;
  columns: string[];
}

export interface GenerateChartInput {
  queryResults: QueryResults;
  sqlQuery: string;
  userInput: string;
  chartType?: ChartType; // Optional: if provided, skip selection step
  analysisConsent?: {
    approved: boolean;
    limit?: number;
  };
}

const chartTypeSelector = new AiSdkChartTypeSelector();
const chartConfigTemplateGenerator = new AiSdkChartConfigTemplateGenerator();

const chartUseCase = new GenerateChartConfigUseCase({
  chartTypeSelector,
  chartConfigTemplateGenerator,
});

export async function selectChartType(
  queryResults: QueryResults,
  sqlQuery: string,
  userInput: string,
  analysisConsent?: { approved: boolean; limit?: number },
): Promise<{ chartType: ChartType; reasoningText: string }> {
  try {
    return await chartTypeSelector.select({
      queryResults,
      sqlQuery,
      userInput,
      analysisConsent,
    });
  } catch (error) {
    const logger = await getLogger();
    logger.error('[selectChartType] ERROR:', error);
    const supportedTypes = getSupportedChartTypes();
    const fallbackType = supportedTypes[0] || 'bar';
    return {
      chartType: fallbackType,
      reasoningText: `Failed to analyze chart type, defaulting to ${fallbackType} chart`,
    };
  }
}

export async function generateChartConfig(
  chartType: ChartType,
  queryResults: QueryResults,
  sqlQuery: string,
  analysisConsent?: { approved: boolean; limit?: number },
): Promise<ChartConfigTemplate> {
  try {
    return await chartConfigTemplateGenerator.generateTemplate({
      chartType,
      queryResults,
      sqlQuery,
      analysisConsent,
    });
  } catch (error) {
    const logger = await getLogger();
    logger.error('[generateChartConfig] ERROR:', error);
    throw new Error(
      `Failed to generate chart configuration: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Main function: Generate chart from query results
 * This is the entry point called by the generateChart tool
 */
export async function generateChart(
  input: GenerateChartInput,
): Promise<ChartConfig> {
  return chartUseCase.execute({
    queryResults: input.queryResults,
    sqlQuery: input.sqlQuery,
    userInput: input.userInput,
    chartType: input.chartType,
    analysisConsent: input.analysisConsent,
  });
}
