/**
 * Entity Class - OWL-inspired class hierarchy for semantic modeling
 * Represents a logical entity/concept in the data model
 */
export interface EntityClass {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description for documentation */
  description: string;

  /** Source table this class represents */
  sourceTable: string;

  /** Parent class for inheritance (OWL:subClassOf) */
  parentClass?: string;

  /** Whether this is an abstract class (cannot be instantiated directly) */
  isAbstract?: boolean;

  /** Properties this class must have */
  requiredProperties: string[];

  /** Optional properties */
  optionalProperties: string[];

  /** Equivalent classes (OWL:equivalentClass) */
  equivalentTo?: string[];

  /** Disjoint classes (OWL:disjointWith) */
  disjointWith?: string[];

  /** Domain classification for query optimization */
  domain:
    | 'transactional'
    | 'dimensional'
    | 'reference'
    | 'bridge'
    | 'aggregate';

  /** Primary key column(s) */
  primaryKey?: string[];

  /** Confidence score for inferred classes */
  confidence: number;

  /** How this class was inferred */
  inferenceMethod: 'schema' | 'statistical' | 'llm' | 'user_defined';
}

/**
 * Create an EntityClass with defaults
 */
export function createEntityClass(params: {
  name: string;
  sourceTable: string;
  description?: string;
  parentClass?: string;
  isAbstract?: boolean;
  requiredProperties?: string[];
  optionalProperties?: string[];
  equivalentTo?: string[];
  disjointWith?: string[];
  domain?: EntityClass['domain'];
  primaryKey?: string[];
  confidence?: number;
  inferenceMethod?: EntityClass['inferenceMethod'];
}): EntityClass {
  return {
    id: params.name.toLowerCase().replace(/\s+/g, '_'),
    name: params.name,
    description: params.description ?? '',
    sourceTable: params.sourceTable,
    parentClass: params.parentClass,
    isAbstract: params.isAbstract,
    requiredProperties: params.requiredProperties ?? [],
    optionalProperties: params.optionalProperties ?? [],
    equivalentTo: params.equivalentTo,
    disjointWith: params.disjointWith,
    domain: params.domain ?? 'reference',
    primaryKey: params.primaryKey,
    confidence: params.confidence ?? 1.0,
    inferenceMethod: params.inferenceMethod ?? 'schema',
  };
}
