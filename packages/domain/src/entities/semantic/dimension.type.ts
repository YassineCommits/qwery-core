/**
 * Hierarchy definition for hierarchical dimensions
 */
export interface DimensionHierarchy {
  /** Hierarchy name (e.g., "time_hierarchy", "geo_hierarchy") */
  name: string;
  /** Levels from coarse to fine (e.g., ["year", "quarter", "month", "day"]) */
  levels: string[];
}

/**
 * Bucket definition for numeric bucketing
 */
export interface DimensionBucket {
  /** Minimum value (inclusive) */
  min: number;
  /** Maximum value (exclusive, except for last bucket) */
  max: number;
  /** Display label */
  label: string;
}

/**
 * A dimension represents a grouping attribute in the semantic layer
 * Example: "region" = customers.region
 */
export interface Dimension {
  /** Unique identifier for the dimension */
  id: string;

  /** Human-readable name (e.g., "region", "product_category") */
  name: string;

  /** Full column reference (e.g., "customers.region") */
  column: string;

  /** Table containing this dimension */
  table: string;

  /** Description for documentation and LLM context */
  description: string;

  /** Cardinality hint for query optimization */
  cardinality: 'low' | 'medium' | 'high';

  /** Data type */
  dataType: 'string' | 'number' | 'date' | 'datetime' | 'boolean';

  /** Whether this dimension is a primary key */
  isPrimaryKey?: boolean;

  /** Whether this dimension is a foreign key */
  isForeignKey?: boolean;

  /** Related dimension if this is a foreign key */
  referencedDimension?: string;

  /** Dimension type for specialized handling */
  dimensionType?:
    | 'categorical'
    | 'time'
    | 'numeric_bucket'
    | 'geographic'
    | 'hierarchical';

  /** Hierarchy definition for hierarchical dimensions */
  hierarchy?: DimensionHierarchy;

  /** Dimensions to drill down to */
  drillTo?: string[];

  /** Dimensions to drill up from */
  drillFrom?: string[];

  /** Time granularity for time dimensions */
  timeGranularity?: 'day' | 'week' | 'month' | 'quarter' | 'year';

  /** Bucket definitions for numeric dimensions */
  buckets?: DimensionBucket[];

  /** SQL expression for computed dimensions */
  expression?: string;

  /** Aliases for natural language matching */
  aliases?: string[];

  /** Sample values (for context) */
  sampleValues?: string[];

  /** Confidence score for inferred dimensions */
  confidence?: number;

  /** Inference method */
  inferenceMethod?: 'schema' | 'statistical' | 'llm' | 'user_defined';
}

/**
 * Create a dimension with default values
 */
export function createDimension(params: {
  name: string;
  column: string;
  table: string;
  description?: string;
  cardinality?: Dimension['cardinality'];
  dataType?: Dimension['dataType'];
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  referencedDimension?: string;
  dimensionType?: Dimension['dimensionType'];
  hierarchy?: DimensionHierarchy;
  drillTo?: string[];
  drillFrom?: string[];
  timeGranularity?: Dimension['timeGranularity'];
  buckets?: DimensionBucket[];
  expression?: string;
  aliases?: string[];
  sampleValues?: string[];
  confidence?: number;
  inferenceMethod?: Dimension['inferenceMethod'];
}): Dimension {
  return {
    id: params.name.toLowerCase().replace(/\s+/g, '_'),
    name: params.name,
    column: params.column,
    table: params.table,
    description: params.description ?? '',
    cardinality: params.cardinality ?? 'medium',
    dataType: params.dataType ?? 'string',
    isPrimaryKey: params.isPrimaryKey,
    isForeignKey: params.isForeignKey,
    referencedDimension: params.referencedDimension,
    dimensionType: params.dimensionType ?? 'categorical',
    hierarchy: params.hierarchy,
    drillTo: params.drillTo,
    drillFrom: params.drillFrom,
    timeGranularity: params.timeGranularity,
    buckets: params.buckets,
    expression: params.expression,
    aliases: params.aliases,
    sampleValues: params.sampleValues,
    confidence: params.confidence ?? 1.0,
    inferenceMethod: params.inferenceMethod ?? 'schema',
  };
}
