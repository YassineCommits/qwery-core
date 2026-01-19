/**
 * Semantic Constraint - SHACL-inspired validation rules
 * Defines constraints and validation rules for entities and properties
 */
export interface SemanticConstraint {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description */
  description: string;

  /** Target entity class */
  targetClass: string;

  /** Property constraints */
  propertyConstraints: PropertyConstraint[];

  /** Class-level constraints */
  classConstraints: ClassConstraint[];

  /** Severity level */
  severity: 'error' | 'warning' | 'info';

  /** Whether this constraint is active */
  active: boolean;
}

/**
 * Property-level constraint (SHACL-style)
 */
export interface PropertyConstraint {
  /** Target property */
  property: string;

  /** Minimum occurrences */
  minCount?: number;

  /** Maximum occurrences */
  maxCount?: number;

  /** Required data type */
  datatype?: string;

  /** Regex pattern for string values */
  pattern?: string;

  /** Minimum value for numeric properties */
  minValue?: number;

  /** Maximum value for numeric properties */
  maxValue?: number;

  /** Minimum string length */
  minLength?: number;

  /** Maximum string length */
  maxLength?: number;

  /** Allowed values (enumeration) */
  in?: unknown[];

  /** Required value */
  hasValue?: unknown;

  /** Disallowed values */
  notIn?: unknown[];

  /** Custom validation expression (SQL) */
  expression?: string;

  /** Error message */
  message?: string;
}

/**
 * Class-level constraint
 */
export interface ClassConstraint {
  /** Constraint type */
  type:
    | 'unique_together' // Multiple columns must be unique together
    | 'at_least_one' // At least one of the properties must have a value
    | 'mutually_exclusive' // Only one of the properties can have a value
    | 'depends_on' // Property A requires property B
    | 'custom'; // Custom SQL expression

  /** Properties involved */
  properties: string[];

  /** Custom expression for 'custom' type */
  expression?: string;

  /** Error message */
  message?: string;
}

/**
 * Create a SemanticConstraint with defaults
 */
export function createSemanticConstraint(params: {
  name: string;
  targetClass: string;
  propertyConstraints?: PropertyConstraint[];
  classConstraints?: ClassConstraint[];
  severity?: SemanticConstraint['severity'];
  description?: string;
  active?: boolean;
}): SemanticConstraint {
  return {
    id: `${params.targetClass}_${params.name}`
      .toLowerCase()
      .replace(/\s+/g, '_'),
    name: params.name,
    description: params.description ?? '',
    targetClass: params.targetClass,
    propertyConstraints: params.propertyConstraints ?? [],
    classConstraints: params.classConstraints ?? [],
    severity: params.severity ?? 'error',
    active: params.active ?? true,
  };
}
