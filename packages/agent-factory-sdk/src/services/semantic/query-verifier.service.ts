import type { LogicalPlan, Filter } from './logical-plan.type';
import type { SemanticModel } from '@qwery/domain/entities';

export interface VerificationResult {
  valid: boolean;
  errors: VerificationError[];
  warnings: string[];
  suggestions: string[];
}

export interface VerificationError {
  type:
    | 'missing_table'
    | 'missing_column'
    | 'invalid_join'
    | 'invalid_filter'
    | 'type_mismatch'
    | 'ambiguous_reference';
  message: string;
  path?: string;
}

/**
 * Query Verifier Service
 * Validates logical plans against the semantic model
 * Ensures SQL generation will produce correct queries
 */
export class QueryVerifierService {
  /**
   * Verify a logical plan against a semantic model
   */
  verify(plan: LogicalPlan, semanticModel: SemanticModel): VerificationResult {
    const errors: VerificationError[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Verify tables exist
    for (const table of plan.tables) {
      if (!this.tableExists(table, semanticModel)) {
        errors.push({
          type: 'missing_table',
          message: `Table "${table}" not found in semantic model`,
          path: table,
        });
      }
    }

    // Verify joins are valid
    for (const join of plan.joins) {
      const joinError = this.verifyJoin(join, semanticModel);
      if (joinError) {
        errors.push(joinError);
      }
    }

    // Verify projections reference valid columns
    for (const projection of plan.projections) {
      if (projection.type === 'metric') {
        if (!semanticModel.metrics.has(projection.alias ?? projection.name)) {
          // Not an error - could be a direct expression
          const metricName = projection.alias ?? projection.name;
          if (!this.isValidExpression(projection.name)) {
            warnings.push(
              `Metric "${metricName}" not found in semantic model, using raw expression`,
            );
          }
        }
      } else if (projection.type === 'dimension') {
        if (
          !semanticModel.dimensions.has(projection.alias ?? projection.name)
        ) {
          const dimName = projection.alias ?? projection.name;
          warnings.push(
            `Dimension "${dimName}" not found in semantic model, using raw column`,
          );
        }
      } else if (projection.type === 'column') {
        const columnError = this.verifyColumn(
          projection.name,
          plan.tables,
          semanticModel,
        );
        if (columnError) {
          warnings.push(columnError);
        }
      }
    }

    // Verify filters
    for (const filter of plan.filters) {
      const filterErrors = this.verifyFilter(
        filter,
        plan.tables,
        semanticModel,
      );
      errors.push(...filterErrors);
    }

    // Verify group by columns
    for (const groupCol of plan.groupBy) {
      const groupError = this.verifyColumn(
        groupCol,
        plan.tables,
        semanticModel,
      );
      if (groupError) {
        warnings.push(`GROUP BY: ${groupError}`);
      }
    }

    // Check for common issues
    if (
      plan.hasAggregation &&
      plan.groupBy.length === 0 &&
      plan.projections.length > 1
    ) {
      const nonAggregates = plan.projections.filter(
        (p) => p.type !== 'metric' && !this.isAggregateExpression(p.name),
      );
      if (nonAggregates.length > 0) {
        warnings.push(
          `Query has aggregation but no GROUP BY. Non-aggregated columns may cause errors: ${nonAggregates.map((p) => p.name).join(', ')}`,
        );
        suggestions.push('Add dimensions to GROUP BY clause');
      }
    }

    // Suggest join optimizations
    if (plan.joins.length > 2) {
      suggestions.push(
        'Query involves multiple joins. Consider verifying join order for optimal performance.',
      );
    }

    // Check for potentially expensive operations
    if (!plan.limit && plan.tables.length > 0) {
      suggestions.push(
        'Consider adding a LIMIT clause to prevent large result sets',
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Verify result set against expectations
   */
  verifyResults(
    results: { rows: Array<Record<string, unknown>>; columns: string[] },
    plan: LogicalPlan,
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check if we got results
    if (results.rows.length === 0) {
      issues.push('Query returned no results');
    }

    // Verify expected columns are present
    const expectedColumns = plan.projections
      .map((p) => p.alias ?? p.name)
      .filter((name) => !name.includes('('));

    for (const expected of expectedColumns) {
      const found = results.columns.some(
        (col) =>
          col.toLowerCase() === expected.toLowerCase() ||
          col.toLowerCase().includes(expected.toLowerCase()),
      );
      if (!found) {
        issues.push(`Expected column "${expected}" not found in results`);
      }
    }

    // Sanity check row counts for aggregations
    if (plan.hasAggregation && plan.groupBy.length > 0) {
      const maxExpectedRows = Math.pow(10, plan.groupBy.length);
      if (results.rows.length > maxExpectedRows * 10) {
        issues.push(
          `Unusually high row count (${results.rows.length}) for aggregated query`,
        );
      }
    }

    // Check for null values in key columns
    if (results.rows.length > 0 && plan.projections.length > 0) {
      const firstRow = results.rows[0];
      if (firstRow) {
        for (const projection of plan.projections) {
          const colName = projection.alias ?? projection.name;
          const col = results.columns.find(
            (c) => c.toLowerCase() === colName.toLowerCase(),
          );
          if (col && firstRow[col] === null) {
            issues.push(`Column "${col}" contains null in first row`);
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Check if a table exists in the semantic model
   */
  private tableExists(table: string, model: SemanticModel): boolean {
    // Check table aliases
    if (model.tableAliases.has(table.toLowerCase())) {
      return true;
    }

    // Check if any dimension references this table
    for (const dimension of model.dimensions.values()) {
      if (dimension.table.toLowerCase() === table.toLowerCase()) {
        return true;
      }
    }

    // Check if any metric requires this table
    for (const metric of model.metrics.values()) {
      if (
        metric.requiredTables.some(
          (t) => t.toLowerCase() === table.toLowerCase(),
        )
      ) {
        return true;
      }
    }

    // Check joins
    for (const join of model.joins) {
      if (
        join.fromTable.toLowerCase() === table.toLowerCase() ||
        join.toTable.toLowerCase() === table.toLowerCase()
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Verify a join specification
   */
  private verifyJoin(
    join: { table: string; condition: string; type: string },
    model: SemanticModel,
  ): VerificationError | null {
    // Check if join path exists in semantic model
    const matchingJoin = model.joins.find(
      (j) =>
        j.toTable.toLowerCase() === join.table.toLowerCase() ||
        j.fromTable.toLowerCase() === join.table.toLowerCase(),
    );

    if (!matchingJoin) {
      return {
        type: 'invalid_join',
        message: `No join path defined for table "${join.table}" in semantic model`,
        path: join.table,
      };
    }

    return null;
  }

  /**
   * Verify a column reference
   */
  private verifyColumn(
    column: string,
    tables: string[],
    _model: SemanticModel,
  ): string | null {
    // If column includes table prefix, verify it
    if (column.includes('.')) {
      const [table] = column.split('.');
      if (
        table &&
        !tables.some((t) => t.toLowerCase() === table.toLowerCase())
      ) {
        return `Column "${column}" references table "${table}" which is not in the query`;
      }
    }

    return null;
  }

  /**
   * Verify a filter condition
   */
  private verifyFilter(
    filter: Filter,
    tables: string[],
    model: SemanticModel,
  ): VerificationError[] {
    const errors: VerificationError[] = [];

    // Verify column exists
    const columnError = this.verifyColumn(filter.column, tables, model);
    if (columnError) {
      errors.push({
        type: 'missing_column',
        message: columnError,
        path: filter.column,
      });
    }

    // Verify filter value type
    if (filter.operator === 'IN' || filter.operator === 'NOT IN') {
      if (!Array.isArray(filter.value)) {
        errors.push({
          type: 'type_mismatch',
          message: `IN/NOT IN operator requires array value for "${filter.column}"`,
          path: filter.column,
        });
      }
    }

    if (filter.operator === 'BETWEEN') {
      if (filter.value2 === undefined) {
        errors.push({
          type: 'invalid_filter',
          message: `BETWEEN operator requires two values for "${filter.column}"`,
          path: filter.column,
        });
      }
    }

    return errors;
  }

  /**
   * Check if an expression is a valid SQL expression
   */
  private isValidExpression(expr: string): boolean {
    // Simple check for aggregate functions or column references
    return (
      /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(expr) ||
      /^(SUM|AVG|COUNT|MIN|MAX|DISTINCT)\s*\(/i.test(expr)
    );
  }

  /**
   * Check if expression contains aggregation
   */
  private isAggregateExpression(expr: string): boolean {
    return /\b(SUM|AVG|COUNT|MIN|MAX|DISTINCT)\s*\(/i.test(expr);
  }
}

export const queryVerifier = new QueryVerifierService();
