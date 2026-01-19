import { generateObject } from 'ai';
import { resolveModel, getDefaultModel } from '../../services';
import {
  ChartTypeSelectionSchema,
  ChartConfigSchema,
  type ChartType,
} from '../types/chart.types';
import { SELECT_CHART_TYPE_PROMPT } from '../prompts/select-chart-type.prompt';
import { GENERATE_CHART_CONFIG_PROMPT } from '../prompts/generate-chart-config.prompt';
import { getSupportedChartTypes } from '../config/supported-charts';

export interface QueryResults {
  rows: Array<Record<string, unknown>>;
  columns: string[];
}

export interface GenerateChartInput {
  queryResults: QueryResults;
  sqlQuery: string;
  userInput: string;
  chartType?: ChartType;
}

interface ColumnAnalysis {
  name: string;
  isNumeric: boolean;
  isDate: boolean;
  isCategory: boolean;
  uniqueCount: number;
  sampleValues: unknown[];
}

/**
 * Analyze column types from query results
 */
function analyzeColumns(queryResults: QueryResults): ColumnAnalysis[] {
  const { columns, rows } = queryResults;

  return columns.map((colName) => {
    const values = rows.slice(0, 100).map((row) => row[colName]);
    const nonNullValues = values.filter((v) => v !== null && v !== undefined);

    const uniqueValues = new Set(nonNullValues.map(String));

    const isNumeric = nonNullValues.every(
      (v) =>
        typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v))),
    );

    const isDate = nonNullValues.some((v) => {
      if (v instanceof Date) return true;
      if (typeof v === 'string') {
        return /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{2}\/\d{2}\/\d{4}/.test(v);
      }
      return false;
    });

    const isCategory =
      !isNumeric && uniqueValues.size <= 20 && uniqueValues.size > 1;

    return {
      name: colName,
      isNumeric,
      isDate,
      isCategory,
      uniqueCount: uniqueValues.size,
      sampleValues: nonNullValues.slice(0, 5),
    };
  });
}

/**
 * Heuristic chart type selection based on data structure
 * Returns null if heuristics are not confident enough
 */
function selectChartTypeHeuristic(
  queryResults: QueryResults,
  userInput: string,
): { chartType: ChartType; reasoning: string } | null {
  const { rows, columns } = queryResults;
  const userInputLower = userInput.toLowerCase();

  // User explicitly requested a chart type
  if (userInputLower.includes('pie')) {
    return { chartType: 'pie', reasoning: 'User requested pie chart' };
  }
  if (userInputLower.includes('line')) {
    return { chartType: 'line', reasoning: 'User requested line chart' };
  }
  if (userInputLower.includes('bar')) {
    return { chartType: 'bar', reasoning: 'User requested bar chart' };
  }

  // Need at least 2 rows and 2 columns for meaningful chart
  if (rows.length < 2 || columns.length < 2) {
    return null;
  }

  const columnAnalysis = analyzeColumns(queryResults);
  const numericColumns = columnAnalysis.filter((c) => c.isNumeric);
  const dateColumns = columnAnalysis.filter((c) => c.isDate);
  const categoryColumns = columnAnalysis.filter((c) => c.isCategory);

  // Time series: has date column + numeric column → line chart
  if (dateColumns.length > 0 && numericColumns.length > 0) {
    return {
      chartType: 'line',
      reasoning:
        'Data contains date/time column with numeric values - best for line chart',
    };
  }

  // Distribution/composition: small number of categories with numeric values
  if (categoryColumns.length > 0 && numericColumns.length > 0) {
    const mainCategory = categoryColumns[0]!;

    // Pie chart: few categories (2-7), single numeric value per category
    if (
      mainCategory.uniqueCount >= 2 &&
      mainCategory.uniqueCount <= 7 &&
      rows.length <= 10
    ) {
      return {
        chartType: 'pie',
        reasoning: `Data shows ${mainCategory.uniqueCount} categories - suitable for pie chart to show distribution`,
      };
    }

    // Bar chart: more categories or comparison focus
    if (mainCategory.uniqueCount <= 20) {
      return {
        chartType: 'bar',
        reasoning: `Data has ${mainCategory.uniqueCount} categories - bar chart best for comparison`,
      };
    }
  }

  // Keywords in user input suggesting trend/time
  if (
    userInputLower.match(
      /\b(trend|over\s*time|growth|change|monthly|weekly|daily|yearly)\b/,
    )
  ) {
    return {
      chartType: 'line',
      reasoning: 'Query suggests trend/time analysis - line chart recommended',
    };
  }

  // Keywords suggesting comparison
  if (userInputLower.match(/\b(compare|comparison|vs|versus|by|per|group)\b/)) {
    return {
      chartType: 'bar',
      reasoning: 'Query suggests comparison - bar chart recommended',
    };
  }

  // Keywords suggesting distribution/proportion
  if (
    userInputLower.match(
      /\b(distribution|breakdown|proportion|share|percentage|composition)\b/,
    )
  ) {
    return {
      chartType: 'pie',
      reasoning: 'Query suggests distribution analysis - pie chart recommended',
    };
  }

  // Not confident enough, defer to LLM
  return null;
}

/**
 * Step 1: Select the best chart type based on data analysis
 * Uses heuristics first, falls back to LLM if not confident
 */
export async function selectChartType(
  queryResults: QueryResults,
  sqlQuery: string,
  userInput: string,
): Promise<{ chartType: ChartType; reasoning: string }> {
  // Try heuristic selection first (faster, no LLM call)
  const heuristicResult = selectChartTypeHeuristic(queryResults, userInput);
  if (heuristicResult) {
    console.log(
      `[selectChartType] Heuristic selection: ${heuristicResult.chartType} - ${heuristicResult.reasoning}`,
    );
    return heuristicResult;
  }

  // Fall back to LLM for complex cases
  console.log('[selectChartType] Heuristics not confident, using LLM');

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(new Error('Chart type selection timeout after 30 seconds')),
        30000,
      );
    });

    const generatePromise = generateObject({
      model: await resolveModel(getDefaultModel()),
      schema: ChartTypeSelectionSchema,
      prompt: SELECT_CHART_TYPE_PROMPT(userInput, sqlQuery, queryResults, null),
    });

    const result = await Promise.race([generatePromise, timeoutPromise]);
    return result.object;
  } catch (error) {
    console.error('[selectChartType] ERROR:', error);
    const supportedTypes = getSupportedChartTypes();
    const fallbackType = supportedTypes[0] || 'bar';
    return {
      chartType: fallbackType,
      reasoning: `Failed to analyze chart type, defaulting to ${fallbackType} chart`,
    };
  }
}

/**
 * Step 2: Generate chart configuration JSON
 */
export async function generateChartConfig(
  chartType: ChartType,
  queryResults: QueryResults,
  sqlQuery: string,
): Promise<{
  chartType: ChartType;
  data: Array<Record<string, unknown>>;
  config: {
    colors: string[];
    labels?: Record<string, string>;
    xKey?: string;
    yKey?: string;
    nameKey?: string;
    valueKey?: string;
  };
}> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(new Error('Chart config generation timeout after 30 seconds')),
        30000,
      );
    });

    const generatePromise = generateObject({
      model: await resolveModel(getDefaultModel()),
      schema: ChartConfigSchema,
      prompt: GENERATE_CHART_CONFIG_PROMPT(
        chartType,
        queryResults,
        sqlQuery,
        null,
      ),
    });

    const result = await Promise.race([generatePromise, timeoutPromise]);
    return result.object;
  } catch (error) {
    console.error('[generateChartConfig] ERROR:', error);
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
export async function generateChart(input: GenerateChartInput): Promise<{
  chartType: ChartType;
  data: Array<Record<string, unknown>>;
  config: {
    colors: string[];
    labels?: Record<string, string>;
    xKey?: string;
    yKey?: string;
    nameKey?: string;
    valueKey?: string;
  };
}> {
  // Step 1: Always select chart type to get reasoning for UI
  // Even if chartType is provided, we still call selectChartType to get the reasoning
  // This ensures the UI always has the selection data to display
  const selection = await selectChartType(
    input.queryResults,
    input.sqlQuery,
    input.userInput,
  );
  const chartType = input.chartType || selection.chartType;

  // Step 2: Generate chart configuration
  const chartConfig = await generateChartConfig(
    chartType,
    input.queryResults,
    input.sqlQuery,
  );

  return chartConfig;
}
