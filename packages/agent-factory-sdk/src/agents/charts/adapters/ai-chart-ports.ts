import { generateObject } from 'ai';
import { resolveModel, getDefaultModel } from '../../../services';
import { buildChartMetadata } from '../../tools/chart-metadata';
import {
  ChartConfigTemplateSchema,
  ChartTypeSelectionSchema,
  type ChartConfigTemplate,
} from '../../types/chart.types';
import { SELECT_CHART_TYPE_PROMPT } from '../../prompts/select-chart-type.prompt';
import { GENERATE_CHART_CONFIG_PROMPT } from '../../prompts/generate-chart-config.prompt';
import type {
  ChartConfigTemplateGeneratorPort,
  ChartTypeSelectorPort,
  GenerateChartConfigTemplateInput,
  SelectChartTypeInput,
  SelectChartTypeOutput,
} from '../ports';
import { getLogger } from '@qwery/shared/logger';

export class AiSdkChartTypeSelector implements ChartTypeSelectorPort {
  async select(input: SelectChartTypeInput): Promise<SelectChartTypeOutput> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(new Error('Chart type selection timeout after 30 seconds')),
        30000,
      );
    });

    const metadata = buildChartMetadata(input.queryResults);
    const generatePromise = generateObject({
      model: await resolveModel(getDefaultModel()),
      schema: ChartTypeSelectionSchema,
      prompt: SELECT_CHART_TYPE_PROMPT(
        input.userInput,
        input.sqlQuery,
        metadata,
      ),
    });

    try {
      const result = await Promise.race([generatePromise, timeoutPromise]);
      return result.object;
    } catch (error) {
      const logger = await getLogger();
      logger.error('[AiSdkChartTypeSelector] ERROR:', error);
      throw error;
    }
  }
}

export class AiSdkChartConfigTemplateGenerator
  implements ChartConfigTemplateGeneratorPort
{
  async generateTemplate(
    input: GenerateChartConfigTemplateInput,
  ): Promise<ChartConfigTemplate> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(new Error('Chart config generation timeout after 30 seconds')),
        30000,
      );
    });

    const metadata = buildChartMetadata(input.queryResults);
    const generatePromise = generateObject({
      model: await resolveModel(getDefaultModel()),
      schema: ChartConfigTemplateSchema,
      prompt: GENERATE_CHART_CONFIG_PROMPT(
        input.chartType,
        metadata,
        input.sqlQuery,
      ),
    });

    const result = await Promise.race([generatePromise, timeoutPromise]);
    return result.object as ChartConfigTemplate;
  }
}
