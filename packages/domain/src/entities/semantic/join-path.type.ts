/**
 * A join path defines how two tables can be connected
 */
export interface JoinPath {
  /** Unique identifier */
  id: string;

  /** Source table */
  fromTable: string;

  /** Target table */
  toTable: string;

  /** Join condition (e.g., "orders.customer_id = customers.id") */
  condition: string;

  /** Join type */
  type: 'inner' | 'left' | 'right' | 'full';

  /** Source column in the join */
  fromColumn: string;

  /** Target column in the join */
  toColumn: string;

  /** Relationship cardinality */
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';

  /** Whether this is the preferred join path between these tables */
  isPrimary?: boolean;
}

/**
 * Create a join path with default values
 */
export function createJoinPath(params: {
  fromTable: string;
  toTable: string;
  fromColumn: string;
  toColumn: string;
  type?: JoinPath['type'];
  cardinality?: JoinPath['cardinality'];
  isPrimary?: boolean;
}): JoinPath {
  return {
    id: `${params.fromTable}_${params.toTable}`,
    fromTable: params.fromTable,
    toTable: params.toTable,
    fromColumn: params.fromColumn,
    toColumn: params.toColumn,
    condition: `${params.fromTable}.${params.fromColumn} = ${params.toTable}.${params.toColumn}`,
    type: params.type ?? 'left',
    cardinality: params.cardinality ?? 'many_to_one',
    isPrimary: params.isPrimary ?? true,
  };
}
