/**
 * Semantic View - Cube.dev-style governance and exposure control
 * Defines what metrics/dimensions are exposed and how they can be accessed
 */
export interface SemanticView {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description */
  description: string;

  /** Exposed metrics (by ID) */
  exposedMetrics: string[];

  /** Exposed dimensions (by ID) */
  exposedDimensions: string[];

  /** Base entity class */
  baseEntity: string;

  /** Additional entities included via joins */
  includedEntities: string[];

  /** Default join path for multi-entity queries */
  defaultJoinPath?: string[];

  /** Whether this view is public */
  publicAccess: boolean;

  /** Allowed roles (if not public) */
  allowedRoles?: string[];

  /** Pre-aggregations for performance */
  preAggregations?: PreAggregation[];

  /** Default filters applied to all queries */
  defaultFilters?: ViewFilter[];

  /** Row-level security expression */
  rowLevelSecurity?: string;

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Pre-aggregation definition for query optimization
 */
export interface PreAggregation {
  /** Unique identifier */
  id: string;

  /** Name */
  name: string;

  /** Metrics to pre-aggregate */
  metrics: string[];

  /** Dimensions to group by */
  dimensions: string[];

  /** Time dimension for partitioning */
  timeDimension?: string;

  /** Granularity */
  granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year';

  /** Refresh schedule (cron expression) */
  refreshSchedule?: string;

  /** Partition granularity */
  partitionGranularity?: 'day' | 'week' | 'month';
}

/**
 * Default filter for a view
 */
export interface ViewFilter {
  /** Property to filter */
  property: string;

  /** Operator */
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
 * Create a SemanticView with defaults
 */
export function createSemanticView(params: {
  name: string;
  baseEntity: string;
  exposedMetrics?: string[];
  exposedDimensions?: string[];
  includedEntities?: string[];
  defaultJoinPath?: string[];
  publicAccess?: boolean;
  allowedRoles?: string[];
  preAggregations?: PreAggregation[];
  defaultFilters?: ViewFilter[];
  rowLevelSecurity?: string;
  description?: string;
}): SemanticView {
  const now = new Date();
  return {
    id: params.name.toLowerCase().replace(/\s+/g, '_'),
    name: params.name,
    description: params.description ?? '',
    exposedMetrics: params.exposedMetrics ?? [],
    exposedDimensions: params.exposedDimensions ?? [],
    baseEntity: params.baseEntity,
    includedEntities: params.includedEntities ?? [],
    defaultJoinPath: params.defaultJoinPath,
    publicAccess: params.publicAccess ?? true,
    allowedRoles: params.allowedRoles,
    preAggregations: params.preAggregations,
    defaultFilters: params.defaultFilters,
    rowLevelSecurity: params.rowLevelSecurity,
    createdAt: now,
    updatedAt: now,
  };
}
