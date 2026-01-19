/**
 * Property Definition - OWL-style property semantics
 * Defines characteristics and constraints for properties/columns
 */
export interface PropertyDefinition {
  /** Unique identifier */
  id: string;

  /** Property name */
  name: string;

  /** Description */
  description: string;

  /** Source column */
  sourceColumn: string;

  /** Source table */
  sourceTable: string;

  /** Classes this property applies to (OWL:domain) */
  domain: string[];

  /** Expected type/class (OWL:range) */
  range: string;

  /** SQL data type */
  dataType: string;

  /** Functional property - at most one value per entity */
  functional: boolean;

  /** Inverse property name */
  inverse?: string;

  /** Transitive property - A->B->C implies A->C */
  transitive?: boolean;

  /** Symmetric property - A->B implies B->A */
  symmetric?: boolean;

  /** Minimum cardinality */
  minCardinality?: number;

  /** Maximum cardinality */
  maxCardinality?: number;

  /** Whether this is nullable */
  nullable: boolean;

  /** Whether values are unique */
  unique: boolean;

  /** Default value */
  defaultValue?: unknown;

  /** Derived from another property */
  derivedFrom?: string;

  /** SQL expression for computed properties */
  computedExpression?: string;

  /** Aliases for natural language matching */
  aliases?: string[];

  /** Confidence score */
  confidence: number;

  /** Inference method */
  inferenceMethod: 'schema' | 'statistical' | 'llm' | 'user_defined';
}

/**
 * Create a PropertyDefinition with defaults
 */
export function createPropertyDefinition(params: {
  name: string;
  sourceColumn: string;
  sourceTable: string;
  domain?: string[];
  range?: string;
  dataType?: string;
  functional?: boolean;
  inverse?: string;
  transitive?: boolean;
  symmetric?: boolean;
  minCardinality?: number;
  maxCardinality?: number;
  nullable?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  derivedFrom?: string;
  computedExpression?: string;
  aliases?: string[];
  description?: string;
  confidence?: number;
  inferenceMethod?: PropertyDefinition['inferenceMethod'];
}): PropertyDefinition {
  return {
    id: `${params.sourceTable}.${params.sourceColumn}`.toLowerCase(),
    name: params.name,
    description: params.description ?? '',
    sourceColumn: params.sourceColumn,
    sourceTable: params.sourceTable,
    domain: params.domain ?? [],
    range: params.range ?? 'string',
    dataType: params.dataType ?? 'VARCHAR',
    functional: params.functional ?? true,
    inverse: params.inverse,
    transitive: params.transitive,
    symmetric: params.symmetric,
    minCardinality: params.minCardinality,
    maxCardinality: params.maxCardinality,
    nullable: params.nullable ?? true,
    unique: params.unique ?? false,
    defaultValue: params.defaultValue,
    derivedFrom: params.derivedFrom,
    computedExpression: params.computedExpression,
    aliases: params.aliases,
    confidence: params.confidence ?? 1.0,
    inferenceMethod: params.inferenceMethod ?? 'schema',
  };
}
