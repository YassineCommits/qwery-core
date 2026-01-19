import type { SemanticModel, Metric, Dimension } from '@qwery/domain/entities';
import {
  type LogicalPlan,
  type Filter,
  type Join,
  createLogicalPlan,
} from './logical-plan.type';

export interface QueryPlannerInput {
  /** User's natural language query */
  userQuery: string;

  /** Extracted intent from the query */
  intent?: {
    metrics?: string[];
    dimensions?: string[];
    filters?: Array<{ column: string; operator: string; value: unknown }>;
    orderBy?: Array<{ column: string; direction: 'asc' | 'desc' }>;
    limit?: number;
  };
}

export interface QueryPlannerResult {
  plan: LogicalPlan;
  sql: string;
  usedMetrics: Metric[];
  usedDimensions: Dimension[];
  warnings: string[];
}

/**
 * Query Planner Service
 * Generates logical query plans from semantic models
 * Uses deterministic logic - no LLM calls
 */
export class QueryPlannerService {
  /**
   * Generate a logical plan from parsed intent
   */
  plan(input: QueryPlannerInput, semanticModel: SemanticModel): LogicalPlan {
    const plan = createLogicalPlan();
    const warnings: string[] = [];

    if (!input.intent) {
      plan.confidence = 0.3;
      plan.reasoning = 'No structured intent provided, using fallback';
      return plan;
    }

    const { metrics, dimensions, filters, orderBy, limit } = input.intent;

    // Resolve metrics
    const resolvedMetrics: Metric[] = [];
    if (metrics) {
      for (const metricName of metrics) {
        const metric = this.findMetric(metricName, semanticModel);
        if (metric) {
          resolvedMetrics.push(metric);
          plan.projections.push({
            type: 'metric',
            name: metric.expression,
            alias: metric.name,
          });
          plan.hasAggregation = true;

          // Add required tables
          for (const table of metric.requiredTables) {
            if (!plan.tables.includes(table)) {
              plan.tables.push(table);
            }
          }
        } else {
          warnings.push(`Metric "${metricName}" not found in semantic model`);
        }
      }
    }

    // Resolve dimensions
    const resolvedDimensions: Dimension[] = [];
    if (dimensions) {
      for (const dimName of dimensions) {
        const dimension = this.findDimension(dimName, semanticModel);
        if (dimension) {
          resolvedDimensions.push(dimension);
          plan.projections.push({
            type: 'dimension',
            name: dimension.column,
            alias: dimension.name,
            table: dimension.table,
          });
          plan.groupBy.push(dimension.column);

          // Add table
          if (!plan.tables.includes(dimension.table)) {
            plan.tables.push(dimension.table);
          }
        } else {
          warnings.push(`Dimension "${dimName}" not found in semantic model`);
        }
      }
    }

    // Add filters
    if (filters) {
      for (const filter of filters) {
        plan.filters.push({
          column: filter.column,
          operator: filter.operator as Filter['operator'],
          value: filter.value,
        });
      }
    }

    // Add ordering
    if (orderBy) {
      for (const order of orderBy) {
        plan.orderBy.push({
          column: order.column,
          direction: order.direction,
        });
      }
    }

    // Add limit
    if (limit) {
      plan.limit = limit;
    }

    // Resolve joins between tables
    if (plan.tables.length > 1) {
      plan.joins = this.resolveJoins(plan.tables, semanticModel);
      plan.hasJoins = plan.joins.length > 0;
    }

    // Calculate complexity
    plan.complexity = this.calculateComplexity(plan);

    // Calculate confidence
    plan.confidence = this.calculateConfidence(
      plan,
      resolvedMetrics.length,
      metrics?.length ?? 0,
      resolvedDimensions.length,
      dimensions?.length ?? 0,
    );

    plan.reasoning = this.generateReasoning(
      plan,
      resolvedMetrics,
      resolvedDimensions,
    );

    return plan;
  }

  /**
   * Generate SQL from a logical plan
   */
  generateSQL(plan: LogicalPlan, _semanticModel: SemanticModel): string {
    const parts: string[] = [];

    // SELECT clause
    if (plan.projections.length === 0) {
      parts.push('SELECT *');
    } else {
      const selectCols = plan.projections.map((p) => {
        if (p.alias && p.alias !== p.name) {
          return `${p.name} AS "${p.alias}"`;
        }
        return p.name;
      });
      parts.push(`SELECT ${selectCols.join(', ')}`);
    }

    // FROM clause
    if (plan.tables.length > 0) {
      const baseTable = plan.tables[0];
      parts.push(`FROM ${baseTable}`);

      // JOIN clauses
      for (const join of plan.joins) {
        parts.push(
          `${join.type.toUpperCase()} JOIN ${join.table} ON ${join.condition}`,
        );
      }
    }

    // WHERE clause
    if (plan.filters.length > 0) {
      const whereClauses = plan.filters.map((f) => this.formatFilter(f));
      parts.push(`WHERE ${whereClauses.join(' AND ')}`);
    }

    // GROUP BY clause
    if (plan.groupBy.length > 0) {
      parts.push(`GROUP BY ${plan.groupBy.join(', ')}`);
    }

    // HAVING clause
    if (plan.having.length > 0) {
      const havingClauses = plan.having.map((f) => this.formatFilter(f));
      parts.push(`HAVING ${havingClauses.join(' AND ')}`);
    }

    // ORDER BY clause
    if (plan.orderBy.length > 0) {
      const orderClauses = plan.orderBy.map(
        (o) => `${o.column} ${o.direction.toUpperCase()}`,
      );
      parts.push(`ORDER BY ${orderClauses.join(', ')}`);
    }

    // LIMIT clause
    if (plan.limit !== undefined) {
      parts.push(`LIMIT ${plan.limit}`);
    }

    // OFFSET clause
    if (plan.offset !== undefined) {
      parts.push(`OFFSET ${plan.offset}`);
    }

    return parts.join('\n');
  }

  /**
   * Find a metric by name or synonym
   */
  private findMetric(name: string, model: SemanticModel): Metric | undefined {
    const lowerName = name.toLowerCase();

    // Direct lookup
    if (model.metrics.has(lowerName)) {
      return model.metrics.get(lowerName);
    }

    // Search by name
    for (const metric of model.metrics.values()) {
      if (metric.name.toLowerCase() === lowerName) {
        return metric;
      }
    }

    // Search synonyms
    const synonyms = model.synonyms.get(lowerName);
    if (synonyms) {
      for (const syn of synonyms) {
        const found = model.metrics.get(syn.toLowerCase());
        if (found) return found;
      }
    }

    return undefined;
  }

  /**
   * Find a dimension by name or synonym
   */
  private findDimension(
    name: string,
    model: SemanticModel,
  ): Dimension | undefined {
    const lowerName = name.toLowerCase();

    // Direct lookup
    if (model.dimensions.has(lowerName)) {
      return model.dimensions.get(lowerName);
    }

    // Search by name
    for (const dimension of model.dimensions.values()) {
      if (dimension.name.toLowerCase() === lowerName) {
        return dimension;
      }
    }

    // Search synonyms
    const synonyms = model.synonyms.get(lowerName);
    if (synonyms) {
      for (const syn of synonyms) {
        const found = model.dimensions.get(syn.toLowerCase());
        if (found) return found;
      }
    }

    return undefined;
  }

  /**
   * Resolve joins between tables using the semantic model
   * Uses both new SemanticRelationships and legacy JoinPaths
   */
  private resolveJoins(tables: string[], model: SemanticModel): Join[] {
    const joins: Join[] = [];
    const joinedTables = new Set<string>();

    if (tables.length === 0) return joins;

    // Start with first table
    joinedTables.add(tables[0]!);

    // Find join paths to connect remaining tables
    for (let i = 1; i < tables.length; i++) {
      const targetTable = tables[i]!;

      if (joinedTables.has(targetTable)) continue;

      // First, try to find join from SemanticRelationships (new ontology-based)
      let found = false;
      for (const rel of model.relationships) {
        const fromMatch =
          joinedTables.has(rel.fromEntity) && rel.toEntity === targetTable;
        const toMatch =
          joinedTables.has(rel.toEntity) && rel.fromEntity === targetTable;

        if (fromMatch || toMatch) {
          joins.push({
            table: targetTable,
            condition: rel.joinCondition,
            type: rel.joinType,
          });
          joinedTables.add(targetTable);
          found = true;
          break;
        }
      }

      if (found) continue;

      // Fallback to legacy JoinPaths
      for (const joinPath of model.joins) {
        if (
          (joinedTables.has(joinPath.fromTable) &&
            joinPath.toTable === targetTable) ||
          (joinedTables.has(joinPath.toTable) &&
            joinPath.fromTable === targetTable)
        ) {
          joins.push({
            table: targetTable,
            condition: joinPath.condition,
            type: joinPath.type,
          });
          joinedTables.add(targetTable);
          break;
        }
      }
    }

    return joins;
  }

  /**
   * Find a dimension by name, also checking hierarchy levels
   */
  private findDimensionWithHierarchy(
    name: string,
    model: SemanticModel,
  ): { dimension: Dimension; level?: string } | undefined {
    // Direct lookup first
    const direct = this.findDimension(name, model);
    if (direct) return { dimension: direct };

    // Check if name matches a hierarchy level
    for (const dimension of model.dimensions.values()) {
      if (dimension.hierarchy) {
        for (const level of dimension.hierarchy.levels) {
          if (level.toLowerCase() === name.toLowerCase()) {
            return { dimension, level };
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Find entity class by table name
   */
  private findEntityClass(
    tableName: string,
    model: SemanticModel,
  ): import('@qwery/domain/entities').EntityClass | undefined {
    const lowerName = tableName.toLowerCase();

    // Direct lookup
    if (model.entityClasses.has(lowerName)) {
      return model.entityClasses.get(lowerName);
    }

    // Search by source table
    for (const entity of model.entityClasses.values()) {
      if (entity.sourceTable.toLowerCase() === lowerName) {
        return entity;
      }
    }

    return undefined;
  }

  /**
   * Format a filter for SQL
   */
  private formatFilter(filter: Filter): string {
    const { column, operator, value, value2 } = filter;

    switch (operator) {
      case 'IN':
      case 'NOT IN':
        if (Array.isArray(value)) {
          const values = value
            .map((v) => (typeof v === 'string' ? `'${v}'` : v))
            .join(', ');
          return `${column} ${operator} (${values})`;
        }
        return `${column} ${operator} (${value})`;

      case 'BETWEEN':
        return `${column} BETWEEN ${value} AND ${value2}`;

      case 'IS NULL':
      case 'IS NOT NULL':
        return `${column} ${operator}`;

      case 'LIKE':
        return `${column} LIKE '${value}'`;

      default:
        if (typeof value === 'string') {
          return `${column} ${operator} '${value}'`;
        }
        return `${column} ${operator} ${value}`;
    }
  }

  /**
   * Calculate query complexity
   */
  private calculateComplexity(plan: LogicalPlan): LogicalPlan['complexity'] {
    let score = 0;

    // Joins add complexity
    score += plan.joins.length * 2;

    // Aggregations add complexity
    if (plan.hasAggregation) score += 1;

    // Multiple group by columns add complexity
    score += Math.max(0, plan.groupBy.length - 1);

    // Having clause adds complexity
    score += plan.having.length;

    // Subqueries would add more (not implemented yet)

    if (score <= 2) return 'simple';
    if (score <= 5) return 'medium';
    return 'complex';
  }

  /**
   * Calculate confidence in the plan
   */
  private calculateConfidence(
    plan: LogicalPlan,
    resolvedMetrics: number,
    requestedMetrics: number,
    resolvedDimensions: number,
    requestedDimensions: number,
  ): number {
    let confidence = 1.0;

    // Reduce confidence for missing metrics/dimensions
    if (requestedMetrics > 0) {
      confidence *= resolvedMetrics / requestedMetrics;
    }
    if (requestedDimensions > 0) {
      confidence *= resolvedDimensions / requestedDimensions;
    }

    // Reduce confidence for complex queries
    if (plan.complexity === 'complex') {
      confidence *= 0.9;
    }

    // Reduce confidence if joins couldn't be resolved
    if (plan.tables.length > 1 && plan.joins.length < plan.tables.length - 1) {
      confidence *= 0.7;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Generate reasoning explanation
   */
  private generateReasoning(
    plan: LogicalPlan,
    metrics: Metric[],
    dimensions: Dimension[],
  ): string {
    const parts: string[] = [];

    if (metrics.length > 0) {
      parts.push(`Computing ${metrics.map((m) => m.name).join(', ')}`);
    }

    if (dimensions.length > 0) {
      parts.push(`grouped by ${dimensions.map((d) => d.name).join(', ')}`);
    }

    if (plan.joins.length > 0) {
      parts.push(`joining ${plan.joins.length + 1} tables`);
    }

    if (plan.filters.length > 0) {
      parts.push(`with ${plan.filters.length} filter(s)`);
    }

    return parts.join(', ') || 'Simple query';
  }
}

export const queryPlanner = new QueryPlannerService();
