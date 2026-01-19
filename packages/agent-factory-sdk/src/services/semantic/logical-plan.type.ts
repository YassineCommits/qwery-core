/**
 * Projection in a logical query plan
 */
export interface Projection {
  /** Type of projection */
  type: 'metric' | 'dimension' | 'column' | 'expression';

  /** Name or expression */
  name: string;

  /** Optional alias for output */
  alias?: string;

  /** Source table (for columns) */
  table?: string;
}

/**
 * Filter condition in a logical query plan
 */
export interface Filter {
  /** Column or expression to filter */
  column: string;

  /** Comparison operator */
  operator:
    | '='
    | '!='
    | '>'
    | '<'
    | '>='
    | '<='
    | 'IN'
    | 'NOT IN'
    | 'LIKE'
    | 'BETWEEN'
    | 'IS NULL'
    | 'IS NOT NULL';

  /** Filter value(s) */
  value: unknown;

  /** Secondary value for BETWEEN */
  value2?: unknown;
}

/**
 * Join specification in a logical query plan
 */
export interface Join {
  /** Table to join */
  table: string;

  /** Join condition */
  condition: string;

  /** Join type */
  type: 'inner' | 'left' | 'right' | 'full';
}

/**
 * Ordering specification
 */
export interface OrderBy {
  /** Column or expression */
  column: string;

  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * A logical query plan represents the semantic intent of a query
 * before it's translated to SQL
 */
export interface LogicalPlan {
  /** Unique plan identifier */
  id: string;

  /** What to compute/select */
  projections: Projection[];

  /** Base tables involved */
  tables: string[];

  /** Join sequence (order matters) */
  joins: Join[];

  /** Filter conditions */
  filters: Filter[];

  /** Grouping columns */
  groupBy: string[];

  /** Having conditions (for aggregates) */
  having: Filter[];

  /** Ordering */
  orderBy: OrderBy[];

  /** Result limit */
  limit?: number;

  /** Result offset */
  offset?: number;

  /** Whether this plan uses aggregation */
  hasAggregation: boolean;

  /** Whether this plan requires joins */
  hasJoins: boolean;

  /** Estimated complexity */
  complexity: 'simple' | 'medium' | 'complex';

  /** Confidence score (0-1) for plan correctness */
  confidence: number;

  /** Reasoning/explanation for the plan */
  reasoning?: string;
}

/**
 * Create an empty logical plan
 */
export function createLogicalPlan(id?: string): LogicalPlan {
  return {
    id: id ?? crypto.randomUUID(),
    projections: [],
    tables: [],
    joins: [],
    filters: [],
    groupBy: [],
    having: [],
    orderBy: [],
    hasAggregation: false,
    hasJoins: false,
    complexity: 'simple',
    confidence: 1.0,
  };
}
