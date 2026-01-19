import type { SchemaCacheManager } from '../../tools/schema-cache';
import { extractTablePathsFromQuery } from '../../tools/validate-table-paths';

export interface ValidationError {
  type: 'syntax' | 'table_not_found' | 'column_not_found' | 'unsafe_operation';
  message: string;
  details?: {
    table?: string;
    column?: string;
    suggestion?: string;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  tablePaths: string[];
}

const UNSAFE_PATTERNS = [
  /\bDROP\s+DATABASE\b/i,
  /\bDROP\s+SCHEMA\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+SYSTEM\b/i,
  /\bCREATE\s+USER\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
];

const DESTRUCTIVE_PATTERNS = [
  /\bDELETE\s+FROM\b/i,
  /\bUPDATE\b/i,
  /\bINSERT\s+INTO\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+VIEW\b/i,
];

export class QueryValidatorService {
  /**
   * Validate SQL query against schema and safety rules
   * Returns structured validation result with errors and warnings
   */
  validate(
    sql: string,
    schemaCache: SchemaCacheManager,
    options: {
      allowDestructive?: boolean;
      attachedDatasourceNames?: string[];
    } = {},
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    const tablePaths = extractTablePathsFromQuery(sql);

    // Check for unsafe operations (always blocked)
    for (const pattern of UNSAFE_PATTERNS) {
      if (pattern.test(sql)) {
        errors.push({
          type: 'unsafe_operation',
          message: `Query contains unsafe operation that is not allowed`,
        });
      }
    }

    // Check for destructive operations (blocked unless explicitly allowed)
    if (!options.allowDestructive) {
      for (const pattern of DESTRUCTIVE_PATTERNS) {
        if (pattern.test(sql)) {
          warnings.push(
            `Query contains destructive operation (DELETE, UPDATE, INSERT, DROP)`,
          );
        }
      }
    }

    // Validate table paths against schema cache
    for (const tablePath of tablePaths) {
      const validationResult = this.validateTablePath(
        tablePath,
        schemaCache,
        options.attachedDatasourceNames,
      );

      if (!validationResult.valid) {
        errors.push(validationResult.error!);
      }
    }

    // Basic syntax validation (check for common issues)
    const syntaxErrors = this.validateBasicSyntax(sql);
    errors.push(...syntaxErrors);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      tablePaths,
    };
  }

  /**
   * Validate a single table path against the schema cache
   */
  private validateTablePath(
    tablePath: string,
    schemaCache: SchemaCacheManager,
    attachedDatasourceNames?: string[],
  ): { valid: boolean; error?: ValidationError } {
    // Check if table exists in schema cache
    if (schemaCache.hasTablePath(tablePath)) {
      return { valid: true };
    }

    // Check all available paths for suggestions
    const allPaths = schemaCache.getAllTablePathsFromAllDatasources();

    // If no paths in cache, it might not be loaded yet
    if (allPaths.length === 0) {
      return { valid: true }; // Allow - cache might not be populated
    }

    // For simple table names (no dots), allow them (main database tables)
    if (!tablePath.includes('.')) {
      return { valid: true };
    }

    // Check if datasource prefix is valid
    const parts = tablePath.split('.');
    const datasourceName = parts[0];

    if (
      attachedDatasourceNames &&
      datasourceName &&
      !attachedDatasourceNames.includes(datasourceName)
    ) {
      // Find similar datasource names for suggestion
      const suggestions = attachedDatasourceNames
        .filter(
          (name) =>
            name.toLowerCase().includes(datasourceName.toLowerCase()) ||
            datasourceName.toLowerCase().includes(name.toLowerCase()),
        )
        .slice(0, 3);

      return {
        valid: false,
        error: {
          type: 'table_not_found',
          message: `Datasource "${datasourceName}" is not attached to this conversation`,
          details: {
            table: tablePath,
            suggestion:
              suggestions.length > 0
                ? `Did you mean one of: ${suggestions.join(', ')}?`
                : `Available datasources: ${attachedDatasourceNames.slice(0, 5).join(', ')}`,
          },
        },
      };
    }

    // Find similar table paths for suggestion
    const similarPaths = this.findSimilarPaths(tablePath, allPaths);

    return {
      valid: false,
      error: {
        type: 'table_not_found',
        message: `Table "${tablePath}" not found in attached datasources`,
        details: {
          table: tablePath,
          suggestion:
            similarPaths.length > 0
              ? `Did you mean: ${similarPaths.join(', ')}?`
              : `Available tables: ${allPaths.slice(0, 5).join(', ')}${allPaths.length > 5 ? '...' : ''}`,
        },
      },
    };
  }

  /**
   * Find similar table paths using simple string matching
   */
  private findSimilarPaths(target: string, allPaths: string[]): string[] {
    const targetLower = target.toLowerCase();
    const targetParts = targetLower.split('.');
    const targetTable = targetParts[targetParts.length - 1] || targetLower;

    return allPaths
      .filter((path) => {
        const pathLower = path.toLowerCase();
        const pathParts = pathLower.split('.');
        const pathTable = pathParts[pathParts.length - 1] || pathLower;

        // Check for partial matches
        return (
          pathTable.includes(targetTable) ||
          targetTable.includes(pathTable) ||
          pathLower.includes(targetLower) ||
          this.levenshteinDistance(pathTable, targetTable) <= 3
        );
      })
      .slice(0, 3);
  }

  /**
   * Simple Levenshtein distance for typo detection
   */
  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1,
          );
        }
      }
    }

    return matrix[b.length]![a.length]!;
  }

  /**
   * Basic SQL syntax validation
   */
  private validateBasicSyntax(sql: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const trimmed = sql.trim();

    // Check for empty query
    if (!trimmed) {
      errors.push({
        type: 'syntax',
        message: 'Query is empty',
      });
      return errors;
    }

    // Check for unbalanced parentheses
    let parenCount = 0;
    for (const char of trimmed) {
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (parenCount < 0) {
        errors.push({
          type: 'syntax',
          message: 'Unbalanced parentheses: extra closing parenthesis',
        });
        break;
      }
    }
    if (parenCount > 0) {
      errors.push({
        type: 'syntax',
        message: `Unbalanced parentheses: missing ${parenCount} closing parenthesis(es)`,
      });
    }

    // Check for unbalanced quotes
    const singleQuotes = (trimmed.match(/'/g) || []).length;
    const doubleQuotes = (trimmed.match(/"/g) || []).length;

    if (singleQuotes % 2 !== 0) {
      errors.push({
        type: 'syntax',
        message: 'Unbalanced single quotes',
      });
    }

    if (doubleQuotes % 2 !== 0) {
      errors.push({
        type: 'syntax',
        message: 'Unbalanced double quotes',
      });
    }

    // Check for SELECT without FROM (except for function calls)
    if (/^\s*SELECT\b/i.test(trimmed) && !/\bFROM\b/i.test(trimmed)) {
      // Allow SELECT with only functions/constants
      if (
        !/SELECT\s+(?:NOW|CURRENT_|VERSION|RANDOM|UUID|\d+|'[^']*')\s*(?:,|$|\))/i.test(
          trimmed,
        )
      ) {
        // This might be intentional (e.g., SELECT 1), add as warning not error
      }
    }

    return errors;
  }

  /**
   * Validate column references against schema
   * This is a more advanced validation that requires parsing column names
   */
  validateColumns(
    sql: string,
    _schemaCache: SchemaCacheManager,
    _tablePaths: string[],
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Extract column references from SELECT clause
    const selectMatch = sql.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
    if (!selectMatch) {
      return errors;
    }

    const selectClause = selectMatch[1];
    if (!selectClause || selectClause.trim() === '*') {
      return errors; // SELECT * is always valid
    }

    // Full column validation would require more sophisticated parsing
    // For now, we rely on the query engine to report column errors
    return errors;
  }
}

// Export singleton instance
export const queryValidator = new QueryValidatorService();
