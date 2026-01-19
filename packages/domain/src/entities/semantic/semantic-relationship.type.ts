/**
 * Semantic Relationship - formal relationship types beyond simple joins
 * Captures the meaning of relationships between entities
 */
export interface SemanticRelationship {
  /** Unique identifier */
  id: string;

  /** Relationship type */
  type:
    | 'is_a' // Inheritance/subclass
    | 'part_of' // Composition
    | 'has_a' // Association
    | 'derived_from' // Derivation
    | 'aggregates' // Aggregation
    | 'references' // Foreign key reference
    | 'temporal_version_of'; // Versioning

  /** Source entity class */
  fromEntity: string;

  /** Target entity class */
  toEntity: string;

  /** Relationship name (e.g., "has_orders", "belongs_to_customer") */
  name: string;

  /** Description */
  description: string;

  /** Cardinality */
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';

  /** Source column for join */
  fromColumn: string;

  /** Target column for join */
  toColumn: string;

  /** Full join condition SQL */
  joinCondition: string;

  /** Preferred join type */
  joinType: 'inner' | 'left' | 'right' | 'full';

  /** Inverse relationship name */
  inverseOf?: string;

  /** Whether this is bidirectional */
  bidirectional: boolean;

  /** Confidence score (0-1) */
  confidence: number;

  /** How this relationship was inferred */
  inferenceMethod: 'schema' | 'statistical' | 'llm' | 'user_defined';

  /** Whether this is the primary/preferred relationship between these entities */
  isPrimary: boolean;
}

/**
 * Create a SemanticRelationship with defaults
 */
export function createSemanticRelationship(params: {
  fromEntity: string;
  toEntity: string;
  fromColumn: string;
  toColumn: string;
  type?: SemanticRelationship['type'];
  name?: string;
  description?: string;
  cardinality?: SemanticRelationship['cardinality'];
  joinType?: SemanticRelationship['joinType'];
  inverseOf?: string;
  bidirectional?: boolean;
  confidence?: number;
  inferenceMethod?: SemanticRelationship['inferenceMethod'];
  isPrimary?: boolean;
}): SemanticRelationship {
  const name = params.name ?? `${params.fromEntity}_to_${params.toEntity}`;
  return {
    id: `${params.fromEntity}.${params.fromColumn}_${params.toEntity}.${params.toColumn}`,
    type: params.type ?? 'references',
    fromEntity: params.fromEntity,
    toEntity: params.toEntity,
    name,
    description: params.description ?? '',
    cardinality: params.cardinality ?? 'many_to_one',
    fromColumn: params.fromColumn,
    toColumn: params.toColumn,
    joinCondition: `${params.fromEntity}.${params.fromColumn} = ${params.toEntity}.${params.toColumn}`,
    joinType: params.joinType ?? 'left',
    inverseOf: params.inverseOf,
    bidirectional: params.bidirectional ?? false,
    confidence: params.confidence ?? 1.0,
    inferenceMethod: params.inferenceMethod ?? 'schema',
    isPrimary: params.isPrimary ?? true,
  };
}
