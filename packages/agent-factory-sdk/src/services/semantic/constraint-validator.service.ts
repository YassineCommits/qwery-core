import type {
  SemanticModel,
  SemanticConstraint,
  PropertyConstraint,
  ClassConstraint,
  EntityClass,
} from '@qwery/domain/entities';
import type { LogicalPlan } from './logical-plan.type';

/**
 * Validation result for a single constraint
 */
export interface ConstraintValidationResult {
  constraintId: string;
  constraintName: string;
  valid: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  value?: unknown;
}

/**
 * Overall validation result
 */
export interface ValidationResult {
  valid: boolean;
  results: ConstraintValidationResult[];
  errors: ConstraintValidationResult[];
  warnings: ConstraintValidationResult[];
  infos: ConstraintValidationResult[];
}

/**
 * Query validation result
 */
export interface QueryValidationResult {
  valid: boolean;
  issues: QueryValidationIssue[];
}

/**
 * Query validation issue
 */
export interface QueryValidationIssue {
  type:
    | 'missing_table'
    | 'missing_column'
    | 'invalid_join'
    | 'constraint_violation'
    | 'type_mismatch';
  message: string;
  severity: 'error' | 'warning';
  path?: string;
}

/**
 * Constraint Validator Service
 * SHACL-inspired validation for semantic models
 */
export class ConstraintValidatorService {
  /**
   * Validate data against an entity class's constraints
   */
  validate(
    data: Record<string, unknown>,
    targetClass: EntityClass,
    constraints: SemanticConstraint[],
  ): ValidationResult {
    const results: ConstraintValidationResult[] = [];

    // Find constraints for this class
    const relevantConstraints = constraints.filter(
      (c) => c.active && c.targetClass === targetClass.id,
    );

    for (const constraint of relevantConstraints) {
      // Validate property constraints
      for (const propConstraint of constraint.propertyConstraints) {
        const propResults = this.validatePropertyConstraint(
          data,
          propConstraint,
          constraint,
        );
        results.push(...propResults);
      }

      // Validate class constraints
      for (const classConstraint of constraint.classConstraints) {
        const classResult = this.validateClassConstraint(
          data,
          classConstraint,
          constraint,
        );
        results.push(classResult);
      }
    }

    const errors = results.filter((r) => !r.valid && r.severity === 'error');
    const warnings = results.filter(
      (r) => !r.valid && r.severity === 'warning',
    );
    const infos = results.filter((r) => !r.valid && r.severity === 'info');

    return {
      valid: errors.length === 0,
      results,
      errors,
      warnings,
      infos,
    };
  }

  /**
   * Validate a property constraint
   */
  private validatePropertyConstraint(
    data: Record<string, unknown>,
    constraint: PropertyConstraint,
    parent: SemanticConstraint,
  ): ConstraintValidationResult[] {
    const results: ConstraintValidationResult[] = [];
    const value = data[constraint.property];
    const path = constraint.property;

    // minCount
    if (constraint.minCount !== undefined) {
      const count = value === undefined || value === null ? 0 : 1;
      if (count < constraint.minCount) {
        results.push({
          constraintId: parent.id,
          constraintName: parent.name,
          valid: false,
          severity: parent.severity,
          message:
            constraint.message ??
            `Property "${path}" requires at least ${constraint.minCount} value(s)`,
          path,
          value,
        });
      }
    }

    // maxCount
    if (constraint.maxCount !== undefined && value !== undefined) {
      const count = Array.isArray(value) ? value.length : 1;
      if (count > constraint.maxCount) {
        results.push({
          constraintId: parent.id,
          constraintName: parent.name,
          valid: false,
          severity: parent.severity,
          message:
            constraint.message ??
            `Property "${path}" allows at most ${constraint.maxCount} value(s)`,
          path,
          value,
        });
      }
    }

    // datatype check
    if (
      constraint.datatype !== undefined &&
      value !== undefined &&
      value !== null
    ) {
      const actualType = typeof value;
      const expectedType = constraint.datatype.toLowerCase();
      const typeMatch =
        (expectedType === 'string' && actualType === 'string') ||
        (expectedType === 'number' && actualType === 'number') ||
        (expectedType === 'boolean' && actualType === 'boolean') ||
        (expectedType === 'integer' && Number.isInteger(value)) ||
        (expectedType === 'date' && value instanceof Date);

      if (!typeMatch) {
        results.push({
          constraintId: parent.id,
          constraintName: parent.name,
          valid: false,
          severity: parent.severity,
          message:
            constraint.message ??
            `Property "${path}" should be of type ${expectedType}`,
          path,
          value,
        });
      }
    }

    // pattern check
    if (constraint.pattern !== undefined && typeof value === 'string') {
      const regex = new RegExp(constraint.pattern);
      if (!regex.test(value)) {
        results.push({
          constraintId: parent.id,
          constraintName: parent.name,
          valid: false,
          severity: parent.severity,
          message:
            constraint.message ??
            `Property "${path}" does not match pattern ${constraint.pattern}`,
          path,
          value,
        });
      }
    }

    // minValue check
    if (constraint.minValue !== undefined && typeof value === 'number') {
      if (value < constraint.minValue) {
        results.push({
          constraintId: parent.id,
          constraintName: parent.name,
          valid: false,
          severity: parent.severity,
          message:
            constraint.message ??
            `Property "${path}" must be at least ${constraint.minValue}`,
          path,
          value,
        });
      }
    }

    // maxValue check
    if (constraint.maxValue !== undefined && typeof value === 'number') {
      if (value > constraint.maxValue) {
        results.push({
          constraintId: parent.id,
          constraintName: parent.name,
          valid: false,
          severity: parent.severity,
          message:
            constraint.message ??
            `Property "${path}" must be at most ${constraint.maxValue}`,
          path,
          value,
        });
      }
    }

    // minLength check
    if (constraint.minLength !== undefined && typeof value === 'string') {
      if (value.length < constraint.minLength) {
        results.push({
          constraintId: parent.id,
          constraintName: parent.name,
          valid: false,
          severity: parent.severity,
          message:
            constraint.message ??
            `Property "${path}" must have at least ${constraint.minLength} characters`,
          path,
          value,
        });
      }
    }

    // maxLength check
    if (constraint.maxLength !== undefined && typeof value === 'string') {
      if (value.length > constraint.maxLength) {
        results.push({
          constraintId: parent.id,
          constraintName: parent.name,
          valid: false,
          severity: parent.severity,
          message:
            constraint.message ??
            `Property "${path}" must have at most ${constraint.maxLength} characters`,
          path,
          value,
        });
      }
    }

    // in check (enumeration)
    if (constraint.in !== undefined && value !== undefined) {
      if (!constraint.in.includes(value)) {
        results.push({
          constraintId: parent.id,
          constraintName: parent.name,
          valid: false,
          severity: parent.severity,
          message:
            constraint.message ??
            `Property "${path}" must be one of: ${constraint.in.join(', ')}`,
          path,
          value,
        });
      }
    }

    // notIn check
    if (constraint.notIn !== undefined && value !== undefined) {
      if (constraint.notIn.includes(value)) {
        results.push({
          constraintId: parent.id,
          constraintName: parent.name,
          valid: false,
          severity: parent.severity,
          message:
            constraint.message ??
            `Property "${path}" must not be one of: ${constraint.notIn.join(', ')}`,
          path,
          value,
        });
      }
    }

    // hasValue check
    if (constraint.hasValue !== undefined) {
      if (value !== constraint.hasValue) {
        results.push({
          constraintId: parent.id,
          constraintName: parent.name,
          valid: false,
          severity: parent.severity,
          message:
            constraint.message ??
            `Property "${path}" must have value: ${String(constraint.hasValue)}`,
          path,
          value,
        });
      }
    }

    return results;
  }

  /**
   * Validate a class-level constraint
   */
  private validateClassConstraint(
    data: Record<string, unknown>,
    constraint: ClassConstraint,
    parent: SemanticConstraint,
  ): ConstraintValidationResult {
    const { type, properties, message } = constraint;

    switch (type) {
      case 'unique_together':
        // This would need database query to validate - skip for now
        return {
          constraintId: parent.id,
          constraintName: parent.name,
          valid: true,
          severity: 'info',
          message: 'Unique together constraint requires database validation',
        };

      case 'at_least_one': {
        const hasValue = properties.some(
          (p) => data[p] !== undefined && data[p] !== null,
        );
        return {
          constraintId: parent.id,
          constraintName: parent.name,
          valid: hasValue,
          severity: parent.severity,
          message: hasValue
            ? 'At least one property has a value'
            : (message ??
              `At least one of [${properties.join(', ')}] must have a value`),
        };
      }

      case 'mutually_exclusive': {
        const valuesPresent = properties.filter(
          (p) => data[p] !== undefined && data[p] !== null,
        );
        const valid = valuesPresent.length <= 1;
        return {
          constraintId: parent.id,
          constraintName: parent.name,
          valid,
          severity: parent.severity,
          message: valid
            ? 'Mutually exclusive constraint satisfied'
            : (message ??
              `Only one of [${properties.join(', ')}] can have a value`),
        };
      }

      case 'depends_on': {
        // First property depends on second
        const [dependent, required] = properties;
        if (!dependent || !required) {
          return {
            constraintId: parent.id,
            constraintName: parent.name,
            valid: true,
            severity: 'info',
            message: 'Invalid depends_on constraint definition',
          };
        }
        const hasDependent =
          data[dependent] !== undefined && data[dependent] !== null;
        const hasRequired =
          data[required] !== undefined && data[required] !== null;
        const valid = !hasDependent || hasRequired;
        return {
          constraintId: parent.id,
          constraintName: parent.name,
          valid,
          severity: parent.severity,
          message: valid
            ? 'Dependency constraint satisfied'
            : (message ??
              `Property "${dependent}" requires "${required}" to be present`),
        };
      }

      case 'custom':
        // Custom expressions would need SQL execution
        return {
          constraintId: parent.id,
          constraintName: parent.name,
          valid: true,
          severity: 'info',
          message: 'Custom constraint requires database validation',
        };

      default:
        return {
          constraintId: parent.id,
          constraintName: parent.name,
          valid: true,
          severity: 'info',
          message: `Unknown constraint type: ${type}`,
        };
    }
  }

  /**
   * Validate a logical query plan against the semantic model
   */
  validateQuery(
    plan: LogicalPlan,
    model: SemanticModel,
  ): QueryValidationResult {
    const issues: QueryValidationIssue[] = [];

    // Validate tables exist
    for (const table of plan.tables) {
      const tableExists =
        model.entityClasses.has(table.toLowerCase()) ||
        model.tableAliases.has(table.toLowerCase()) ||
        Array.from(model.entityClasses.values()).some(
          (e) => e.sourceTable.toLowerCase() === table.toLowerCase(),
        );

      if (!tableExists) {
        issues.push({
          type: 'missing_table',
          message: `Table "${table}" not found in semantic model`,
          severity: 'error',
          path: table,
        });
      }
    }

    // Validate joins
    for (const join of plan.joins) {
      const hasRelationship = model.relationships.some(
        (r) =>
          r.fromEntity.toLowerCase() === join.table.toLowerCase() ||
          r.toEntity.toLowerCase() === join.table.toLowerCase(),
      );

      const hasLegacyJoin = model.joins.some(
        (j) =>
          j.fromTable.toLowerCase() === join.table.toLowerCase() ||
          j.toTable.toLowerCase() === join.table.toLowerCase(),
      );

      if (!hasRelationship && !hasLegacyJoin) {
        issues.push({
          type: 'invalid_join',
          message: `No relationship defined for table "${join.table}"`,
          severity: 'warning',
          path: join.table,
        });
      }
    }

    // Validate metrics exist
    for (const projection of plan.projections) {
      if (projection.type === 'metric') {
        const metricName = projection.alias ?? projection.name;
        if (!model.metrics.has(metricName.toLowerCase())) {
          issues.push({
            type: 'missing_column',
            message: `Metric "${metricName}" not found in semantic model`,
            severity: 'warning',
            path: metricName,
          });
        }
      }
    }

    return {
      valid: issues.filter((i) => i.severity === 'error').length === 0,
      issues,
    };
  }
}

export const constraintValidator = new ConstraintValidatorService();
