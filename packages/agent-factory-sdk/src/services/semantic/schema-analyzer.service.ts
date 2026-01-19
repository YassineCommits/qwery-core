import type { SimpleSchema, SimpleTable } from '@qwery/domain/entities';
import type { EntityClass, SemanticRelationship } from '@qwery/domain/entities';
import {
  createEntityClass,
  createSemanticRelationship,
} from '@qwery/domain/entities';

/**
 * Table structural analysis result
 */
export interface TableAnalysis {
  tableName: string;
  columnCount: number;
  columns: ColumnAnalysis[];
  primaryKeyColumns: string[];
  foreignKeyColumns: string[];
  isLikelyFact: boolean;
  isLikelyDimension: boolean;
  isLikelyBridge: boolean;
  domain:
    | 'transactional'
    | 'dimensional'
    | 'reference'
    | 'bridge'
    | 'aggregate';
}

/**
 * Column analysis result
 */
export interface ColumnAnalysis {
  columnName: string;
  columnType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  isNumeric: boolean;
  isDate: boolean;
  isBoolean: boolean;
  estimatedCardinality: 'low' | 'medium' | 'high';
  referencedTable?: string;
}

/**
 * Column statistical profile
 */
export interface ColumnProfile {
  columnName: string;
  tableName: string;
  distinctCount?: number;
  nullCount?: number;
  minValue?: unknown;
  maxValue?: unknown;
  avgValue?: number;
  sampleValues?: string[];
}

/**
 * Detected relationship between tables
 */
export interface DetectedRelationship {
  fromTable: string;
  toTable: string;
  fromColumn: string;
  toColumn: string;
  confidence: number;
  inferenceMethod: 'fk_naming' | 'fk_metadata' | 'type_match' | 'statistical';
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
}

/**
 * Table classification result
 */
export interface TableClassification {
  tableName: string;
  classification: 'fact' | 'dimension' | 'bridge' | 'aggregate' | 'reference';
  confidence: number;
  reasoning: string;
}

/**
 * Schema Analyzer Service
 * Multi-pass analysis of database schemas for semantic modeling
 */
export class SchemaAnalyzerService {
  private numericTypes = [
    'int',
    'integer',
    'bigint',
    'smallint',
    'tinyint',
    'float',
    'double',
    'decimal',
    'numeric',
    'real',
    'money',
    'number',
  ];

  private dateTypes = ['date', 'datetime', 'timestamp', 'time', 'timestamptz'];

  private boolTypes = ['bool', 'boolean', 'bit'];

  /**
   * Pass 1: Structural analysis of tables
   */
  analyzeTableStructure(schema: SimpleSchema): TableAnalysis[] {
    const results: TableAnalysis[] = [];

    for (const table of schema.tables) {
      const columns = this.analyzeColumns(table, schema);
      const pkColumns = columns
        .filter((c) => c.isPrimaryKey)
        .map((c) => c.columnName);
      const fkColumns = columns
        .filter((c) => c.isForeignKey)
        .map((c) => c.columnName);

      const numericCount = columns.filter(
        (c) => c.isNumeric && !c.isForeignKey,
      ).length;
      const fkCount = fkColumns.length;
      const totalColumns = columns.length;

      // Fact tables: many FKs, numeric measures
      const isLikelyFact = fkCount >= 2 && numericCount >= 1;

      // Dimension tables: few or no FKs, mostly descriptive columns
      const isLikelyDimension = fkCount <= 1 && numericCount <= 2;

      // Bridge tables: mostly FKs, few other columns
      const isLikelyBridge = fkCount >= 2 && totalColumns <= fkCount + 2;

      let domain: TableAnalysis['domain'] = 'reference';
      if (isLikelyFact) domain = 'transactional';
      else if (isLikelyBridge) domain = 'bridge';
      else if (isLikelyDimension) domain = 'dimensional';

      results.push({
        tableName: table.tableName,
        columnCount: totalColumns,
        columns,
        primaryKeyColumns: pkColumns,
        foreignKeyColumns: fkColumns,
        isLikelyFact,
        isLikelyDimension,
        isLikelyBridge,
        domain,
      });
    }

    return results;
  }

  /**
   * Analyze columns of a table
   */
  private analyzeColumns(
    table: SimpleTable,
    schema: SimpleSchema,
  ): ColumnAnalysis[] {
    const tableNames = new Set(
      schema.tables.map((t) => t.tableName.toLowerCase()),
    );
    const tableNamesArray = Array.from(tableNames);

    return table.columns.map((column) => {
      const colLower = column.columnName.toLowerCase();
      const typeLower = column.columnType.toLowerCase();
      const tableNameLower = table.tableName.toLowerCase();

      const isPrimaryKey =
        colLower === 'id' ||
        colLower === `${tableNameLower}_id` ||
        colLower === `${this.singularize(tableNameLower)}_id`;

      // Enhanced FK detection: *_id pattern OR matches table name pattern
      const endsWithId =
        colLower.endsWith('_id') && colLower !== 'id' && !isPrimaryKey;
      const matchesTableName = this.findMatchingTable(
        colLower,
        tableNamesArray,
      );

      const isForeignKey = endsWithId || !!matchesTableName;
      const isNumeric = this.numericTypes.some((t) => typeLower.includes(t));
      const isDate = this.dateTypes.some((t) => typeLower.includes(t));
      const isBoolean = this.boolTypes.some((t) => typeLower.includes(t));

      // Try to find referenced table
      let referencedTable: string | undefined;
      if (endsWithId) {
        const refName = colLower.replace(/_id$/, '');
        if (tableNames.has(refName)) {
          referencedTable = refName;
        } else if (tableNames.has(`${refName}s`)) {
          referencedTable = `${refName}s`;
        } else if (tableNames.has(this.pluralize(refName))) {
          referencedTable = this.pluralize(refName);
        }
      } else if (matchesTableName) {
        referencedTable = matchesTableName;
      }

      // Estimate cardinality based on column characteristics
      let estimatedCardinality: 'low' | 'medium' | 'high' = 'medium';
      if (isPrimaryKey || isForeignKey) {
        estimatedCardinality = 'high';
      } else if (
        isBoolean ||
        colLower.includes('status') ||
        colLower.includes('type')
      ) {
        estimatedCardinality = 'low';
      }

      return {
        columnName: column.columnName,
        columnType: column.columnType,
        isPrimaryKey,
        isForeignKey,
        isNullable: true, // Default, could be enhanced with metadata
        isNumeric,
        isDate,
        isBoolean,
        estimatedCardinality,
        referencedTable,
      };
    });
  }

  /**
   * Pass 2: Statistical profiling (placeholder - requires query execution)
   */
  profileColumns(_schema: SimpleSchema): ColumnProfile[] {
    // This would require executing queries to get actual statistics
    // For now, return empty - can be enhanced later
    return [];
  }

  /**
   * Pass 3: Relationship detection
   */
  detectRelationships(schema: SimpleSchema): DetectedRelationship[] {
    const relationships: DetectedRelationship[] = [];
    const tableAnalyses = this.analyzeTableStructure(schema);
    const tableMap = new Map(
      tableAnalyses.map((t) => [t.tableName.toLowerCase(), t]),
    );

    for (const tableAnalysis of tableAnalyses) {
      for (const column of tableAnalysis.columns) {
        if (column.isForeignKey && column.referencedTable) {
          const targetTable = tableMap.get(
            column.referencedTable.toLowerCase(),
          );
          if (!targetTable) continue;

          // Find the target column (usually 'id' or matching name)
          const targetColumn = targetTable.columns.find(
            (c) =>
              c.isPrimaryKey ||
              c.columnName.toLowerCase() === column.columnName.toLowerCase(),
          );

          if (targetColumn) {
            relationships.push({
              fromTable: tableAnalysis.tableName,
              toTable: targetTable.tableName,
              fromColumn: column.columnName,
              toColumn: targetColumn.columnName,
              confidence: 0.85,
              inferenceMethod: 'fk_naming',
              cardinality: 'many_to_one',
            });
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Pass 4: Domain classification
   */
  classifyTables(schema: SimpleSchema): TableClassification[] {
    const tableAnalyses = this.analyzeTableStructure(schema);

    return tableAnalyses.map((analysis) => {
      let classification: TableClassification['classification'] = 'reference';
      let confidence = 0.7;
      let reasoning = 'Default classification';

      if (analysis.isLikelyFact) {
        classification = 'fact';
        confidence = 0.85;
        reasoning = `Has ${analysis.foreignKeyColumns.length} FK columns and numeric measures`;
      } else if (analysis.isLikelyBridge) {
        classification = 'bridge';
        confidence = 0.8;
        reasoning = `Primarily consists of foreign keys (${analysis.foreignKeyColumns.length} FKs)`;
      } else if (analysis.isLikelyDimension) {
        classification = 'dimension';
        confidence = 0.75;
        reasoning = `Few FKs and mostly descriptive columns`;
      }

      return {
        tableName: analysis.tableName,
        classification,
        confidence,
        reasoning,
      };
    });
  }

  /**
   * Build entity classes from schema analysis
   */
  buildEntityClasses(schema: SimpleSchema): EntityClass[] {
    const tableAnalyses = this.analyzeTableStructure(schema);
    const classifications = this.classifyTables(schema);
    const classMap = new Map(classifications.map((c) => [c.tableName, c]));

    return tableAnalyses.map((analysis) => {
      const classification = classMap.get(analysis.tableName);
      const requiredProps = analysis.columns
        .filter((c) => c.isPrimaryKey || !c.isNullable)
        .map((c) => c.columnName);
      const optionalProps = analysis.columns
        .filter((c) => !c.isPrimaryKey && c.isNullable)
        .map((c) => c.columnName);

      return createEntityClass({
        name: analysis.tableName,
        sourceTable: analysis.tableName,
        description: `Entity representing ${analysis.tableName}`,
        domain: analysis.domain,
        requiredProperties: requiredProps,
        optionalProperties: optionalProps,
        primaryKey: analysis.primaryKeyColumns,
        confidence: classification?.confidence ?? 0.7,
        inferenceMethod: 'schema',
      });
    });
  }

  /**
   * Build semantic relationships from detected relationships
   */
  buildSemanticRelationships(schema: SimpleSchema): SemanticRelationship[] {
    const detected = this.detectRelationships(schema);

    return detected.map((rel) =>
      createSemanticRelationship({
        fromEntity: rel.fromTable,
        toEntity: rel.toTable,
        fromColumn: rel.fromColumn,
        toColumn: rel.toColumn,
        type: 'references',
        cardinality: rel.cardinality,
        confidence: rel.confidence,
        inferenceMethod:
          rel.inferenceMethod === 'fk_naming' ? 'schema' : 'statistical',
      }),
    );
  }

  /**
   * Simple pluralization (handles common cases)
   */
  private pluralize(word: string): string {
    if (word.endsWith('s')) return word;
    if (word.endsWith('y')) return word.slice(0, -1) + 'ies';
    if (word.endsWith('ch') || word.endsWith('sh') || word.endsWith('x'))
      return word + 'es';
    return word + 's';
  }

  /**
   * Simple singularization (handles common cases)
   */
  private singularize(word: string): string {
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (
      word.endsWith('es') &&
      (word.endsWith('ches') || word.endsWith('shes') || word.endsWith('xes'))
    )
      return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
    return word;
  }

  /**
   * Find a table name that matches a column name pattern
   * Handles: userId -> users, user_id -> users, customer -> customers
   */
  private findMatchingTable(
    columnName: string,
    tableNames: string[],
  ): string | undefined {
    const colLower = columnName.toLowerCase();

    // Skip if it's a generic column
    if (
      [
        'id',
        'created_at',
        'updated_at',
        'name',
        'description',
        'status',
        'type',
      ].includes(colLower)
    ) {
      return undefined;
    }

    // Try direct match first
    for (const tableName of tableNames) {
      const tableNameLower = tableName.toLowerCase();
      const singularTable = this.singularize(tableNameLower);

      // Column matches table name directly (e.g., customer_id -> customers)
      if (
        colLower === `${singularTable}_id` ||
        colLower === `${tableNameLower}_id`
      ) {
        return tableName;
      }

      // camelCase: customerId -> customers
      if (
        colLower === `${singularTable}id` ||
        colLower === `${tableNameLower}id`
      ) {
        return tableName;
      }
    }

    return undefined;
  }
}

export const schemaAnalyzer = new SchemaAnalyzerService();
