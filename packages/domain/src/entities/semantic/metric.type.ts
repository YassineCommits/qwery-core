/**
 * Metric filter for filtered metrics
 */
export interface MetricFilter {
  /** Column to filter */
  column: string;
  /** Filter operator */
  operator:
    | '='
    | '!='
    | '>'
    | '<'
    | '>='
    | '<='
    | 'IN'
    | 'NOT IN'
    | 'IS NULL'
    | 'IS NOT NULL';
  /** Filter value */
  value?: unknown;
}

/**
 * A metric represents a calculated measure in the semantic layer
 * Example: "revenue" = SUM(orders.total_amount)
 */
export interface Metric {
  /** Unique identifier for the metric */
  id: string;

  /** Human-readable name (e.g., "revenue", "total_orders") */
  name: string;

  /** SQL expression for calculation (e.g., "SUM(orders.total_amount)") */
  expression: string;

  /** Description for documentation and LLM context */
  description: string;

  /** Tables required to compute this metric */
  requiredTables: string[];

  /** Result data type */
  dataType: 'number' | 'decimal' | 'integer';

  /** Optional formatting hint (e.g., "currency", "percentage") */
  format?: string;

  /** Optional aggregation type for grouping */
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'count_distinct';

  /** Metric type (dbt MetricFlow-style) */
  metricType?: 'simple' | 'derived' | 'ratio' | 'cumulative';

  /** Time grain for time-based metrics */
  timeGrain?: 'day' | 'week' | 'month' | 'quarter' | 'year';

  /** Time spine table for cumulative metrics */
  timeSpine?: string;

  /** Filters applied to this metric */
  filters?: MetricFilter[];

  /** Numerator metric ID (for ratio metrics) */
  numerator?: string;

  /** Denominator metric ID (for ratio metrics) */
  denominator?: string;

  /** Metrics this metric depends on */
  dependsOn?: string[];

  /** Metric owner/team */
  owner?: string;

  /** Certification status */
  certification?: 'certified' | 'experimental' | 'deprecated';

  /** Aliases for natural language matching */
  aliases?: string[];

  /** Confidence score for inferred metrics */
  confidence?: number;

  /** Inference method */
  inferenceMethod?: 'schema' | 'statistical' | 'llm' | 'user_defined';
}

/**
 * Create a metric with default values
 */
export function createMetric(params: {
  name: string;
  expression: string;
  description?: string;
  requiredTables?: string[];
  dataType?: Metric['dataType'];
  format?: string;
  aggregation?: Metric['aggregation'];
  metricType?: Metric['metricType'];
  timeGrain?: Metric['timeGrain'];
  timeSpine?: string;
  filters?: MetricFilter[];
  numerator?: string;
  denominator?: string;
  dependsOn?: string[];
  owner?: string;
  certification?: Metric['certification'];
  aliases?: string[];
  confidence?: number;
  inferenceMethod?: Metric['inferenceMethod'];
}): Metric {
  return {
    id: params.name.toLowerCase().replace(/\s+/g, '_'),
    name: params.name,
    expression: params.expression,
    description: params.description ?? '',
    requiredTables: params.requiredTables ?? [],
    dataType: params.dataType ?? 'number',
    format: params.format,
    aggregation: params.aggregation,
    metricType: params.metricType ?? 'simple',
    timeGrain: params.timeGrain,
    timeSpine: params.timeSpine,
    filters: params.filters,
    numerator: params.numerator,
    denominator: params.denominator,
    dependsOn: params.dependsOn,
    owner: params.owner,
    certification: params.certification,
    aliases: params.aliases,
    confidence: params.confidence ?? 1.0,
    inferenceMethod: params.inferenceMethod ?? 'schema',
  };
}
