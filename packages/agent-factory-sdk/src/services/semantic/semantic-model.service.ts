import type {
  SemanticModel,
  SimpleSchema,
  Metric,
  Dimension,
  JoinPath,
  InferenceLogEntry,
  PropertyDefinition,
  SerializedSemanticModel,
} from '@qwery/domain/entities';
import {
  createSemanticModel,
  createMetric,
  createDimension,
  createJoinPath,
  createPropertyDefinition,
  serializeSemanticModel,
  deserializeSemanticModel,
} from '@qwery/domain/entities';
import { schemaAnalyzer } from './schema-analyzer.service';

// Lazy-loaded Node.js modules for server-side persistence
let fsModule: typeof import('fs') | null = null;
let pathModule: typeof import('path') | null = null;

function getNodeModules(): {
  fs: typeof import('fs');
  path: typeof import('path');
} | null {
  if (typeof window !== 'undefined') {
    return null;
  }
  if (!fsModule || !pathModule) {
    try {
      /* eslint-disable @typescript-eslint/no-require-imports */
      fsModule = require('fs');
      pathModule = require('path');
      /* eslint-enable @typescript-eslint/no-require-imports */
    } catch {
      return null;
    }
  }
  if (!fsModule || !pathModule) return null;
  return { fs: fsModule, path: pathModule };
}

function getSemanticCacheDir(): string | null {
  const modules = getNodeModules();
  if (!modules) return null;
  return (
    process.env.SEMANTIC_CACHE_DIR ??
    modules.path.join(process.cwd(), '.qwery', 'semantic')
  );
}

/**
 * Semantic Model Service
 * Builds and manages semantic models from schema metadata
 * Now uses the enhanced SchemaAnalyzerService for multi-pass analysis
 */
export class SemanticModelService {
  private cache = new Map<string, SemanticModel>();

  /**
   * Get cached semantic model or build and cache it
   * Priority: 1) Memory cache, 2) Persistent storage, 3) Build from schema
   */
  getOrBuild(datasourceId: string, schema: SimpleSchema): SemanticModel {
    // Check memory cache first
    const cached = this.cache.get(datasourceId);
    if (cached) {
      console.log(`[SemanticModel] Cache hit for datasource: ${datasourceId}`);
      return cached;
    }

    // Check persistent storage
    const persisted = this.loadFromDisk(datasourceId);
    if (persisted) {
      console.log(`[SemanticModel] Loaded from disk: ${datasourceId}`);
      this.cache.set(datasourceId, persisted);
      return persisted;
    }

    // Build from schema
    console.log(`[SemanticModel] Building new model for: ${datasourceId}`);
    const model = this.buildFromSchema(datasourceId, schema);
    this.cache.set(datasourceId, model);
    this.saveToDisk(datasourceId, model);
    return model;
  }

  /**
   * Persist a semantic model to disk (for learning persistence across sessions)
   */
  persistModel(datasourceId: string, model?: SemanticModel): void {
    const modelToPersist = model ?? this.cache.get(datasourceId);
    if (modelToPersist) {
      this.saveToDisk(datasourceId, modelToPersist);
    }
  }

  /**
   * Save model to disk (server-side only)
   */
  private saveToDisk(datasourceId: string, model: SemanticModel): void {
    const modules = getNodeModules();
    const cacheDir = getSemanticCacheDir();
    if (!modules || !cacheDir) return;

    try {
      if (!modules.fs.existsSync(cacheDir)) {
        modules.fs.mkdirSync(cacheDir, { recursive: true });
      }
      const filePath = this.getFilePath(datasourceId);
      if (!filePath) return;
      const serialized = serializeSemanticModel(model);
      modules.fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2));
      console.log(`[SemanticModel] Persisted to: ${filePath}`);
    } catch (err) {
      console.warn(`[SemanticModel] Failed to persist: ${err}`);
    }
  }

  /**
   * Load model from disk (server-side only)
   */
  private loadFromDisk(datasourceId: string): SemanticModel | null {
    const modules = getNodeModules();
    if (!modules) return null;

    try {
      const filePath = this.getFilePath(datasourceId);
      if (!filePath || !modules.fs.existsSync(filePath)) {
        return null;
      }
      const content = modules.fs.readFileSync(filePath, 'utf-8');
      const data: SerializedSemanticModel = JSON.parse(content);
      return deserializeSemanticModel(data);
    } catch (err) {
      console.warn(`[SemanticModel] Failed to load from disk: ${err}`);
      return null;
    }
  }

  /**
   * Get file path for a datasource's semantic model
   */
  private getFilePath(datasourceId: string): string | null {
    const modules = getNodeModules();
    const cacheDir = getSemanticCacheDir();
    if (!modules || !cacheDir) return null;

    const safeId = datasourceId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return modules.path.join(cacheDir, `${safeId}.json`);
  }

  /**
   * Get cached semantic model without building
   * Returns undefined if not cached
   */
  getCached(datasourceId: string): SemanticModel | undefined {
    return this.cache.get(datasourceId);
  }

  /**
   * Check if a semantic model is cached for a datasource
   */
  isCached(datasourceId: string): boolean {
    return this.cache.has(datasourceId);
  }

  /**
   * Invalidate cache for a specific datasource
   */
  invalidate(datasourceId: string): void {
    this.cache.delete(datasourceId);
    console.log(`[SemanticModel] Cache invalidated for: ${datasourceId}`);
  }

  /**
   * Clear all cached semantic models
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[SemanticModel] Cache cleared');
  }

  /**
   * Get all cached datasource IDs
   */
  getCachedDatasourceIds(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Build a semantic model from schema metadata
   * Uses the enhanced inference engine for ontology-driven modeling
   */
  buildFromSchema(
    projectId: string,
    schema: SimpleSchema,
    existingModel?: SemanticModel,
  ): SemanticModel {
    const model =
      existingModel ??
      createSemanticModel({
        projectId,
        name: `${schema.databaseName}_model`,
        description: `Auto-generated semantic model for ${schema.databaseName}`,
      });

    // Phase 1: Build entity classes using schema analyzer
    const entityClasses = schemaAnalyzer.buildEntityClasses(schema);
    for (const entity of entityClasses) {
      if (!model.entityClasses.has(entity.id)) {
        model.entityClasses.set(entity.id, entity);
        this.addInferenceLog(
          model,
          'entity',
          entity.id,
          entity.inferenceMethod,
          entity.confidence,
        );
      }
    }

    // Phase 2: Build semantic relationships
    const relationships = schemaAnalyzer.buildSemanticRelationships(schema);
    for (const rel of relationships) {
      const exists = model.relationships.some((r) => r.id === rel.id);
      if (!exists) {
        model.relationships.push(rel);
        this.addInferenceLog(
          model,
          'relationship',
          rel.id,
          rel.inferenceMethod,
          rel.confidence,
        );
      }
    }

    // Phase 3: Build property definitions and dimensions
    const tableAnalyses = schemaAnalyzer.analyzeTableStructure(schema);
    for (const analysis of tableAnalyses) {
      for (const column of analysis.columns) {
        // Create property definition
        const propId =
          `${analysis.tableName}.${column.columnName}`.toLowerCase();
        if (!model.properties.has(propId)) {
          const prop = this.createPropertyFromColumn(
            analysis.tableName,
            column,
          );
          model.properties.set(propId, prop);
        }

        // Create dimension for categorical/date/key columns
        const columnType = column.columnType.toLowerCase();
        if (
          this.isCategoricalType(columnType) ||
          this.isIdColumn(column.columnName) ||
          column.isDate
        ) {
          const dimension = this.inferDimension(
            analysis.tableName,
            column.columnName,
            column.columnType,
          );
          if (dimension && !model.dimensions.has(dimension.id)) {
            model.dimensions.set(dimension.id, dimension);
            this.addInferenceLog(
              model,
              'dimension',
              dimension.id,
              'schema',
              dimension.confidence ?? 1.0,
            );
          }
        }
      }
    }

    // Phase 4: Infer metrics from numeric columns
    for (const table of schema.tables) {
      const tableName = table.tableName;
      for (const column of table.columns) {
        const columnName = column.columnName;
        const columnType = column.columnType.toLowerCase();

        if (this.isNumericType(columnType)) {
          const metricName = this.inferMetricName(columnName);
          if (metricName && !model.metrics.has(metricName)) {
            const metric = this.inferMetric(tableName, columnName, columnType);
            if (metric) {
              model.metrics.set(metric.id, metric);
              this.addInferenceLog(
                model,
                'metric',
                metric.id,
                'schema',
                metric.confidence ?? 1.0,
              );
            }
          }
        }
      }
    }

    // Phase 5: Infer joins (legacy, for backward compatibility)
    const joins = this.inferJoins(schema);
    for (const join of joins) {
      const existingJoin = model.joins.find(
        (j) => j.fromTable === join.fromTable && j.toTable === join.toTable,
      );
      if (!existingJoin) {
        model.joins.push(join);
      }
    }

    // Phase 6: Add common synonyms
    this.addCommonSynonyms(model);

    // Calculate overall confidence score
    model.confidenceScore = this.calculateOverallConfidence(model);
    model.updatedAt = new Date();

    return model;
  }

  /**
   * Create a property definition from column analysis
   */
  private createPropertyFromColumn(
    tableName: string,
    column: {
      columnName: string;
      columnType: string;
      isPrimaryKey: boolean;
      isForeignKey: boolean;
      isNullable: boolean;
      isNumeric: boolean;
      isDate: boolean;
      isBoolean: boolean;
      estimatedCardinality: string;
    },
  ): PropertyDefinition {
    let range = 'string';
    if (column.isNumeric) range = 'number';
    else if (column.isDate) range = 'datetime';
    else if (column.isBoolean) range = 'boolean';

    return createPropertyDefinition({
      name: column.columnName,
      sourceColumn: column.columnName,
      sourceTable: tableName,
      domain: [tableName],
      range,
      dataType: column.columnType,
      functional: true,
      nullable: column.isNullable,
      unique: column.isPrimaryKey,
      confidence: 1.0,
      inferenceMethod: 'schema',
    });
  }

  /**
   * Add an entry to the inference log
   */
  private addInferenceLog(
    model: SemanticModel,
    elementType: InferenceLogEntry['elementType'],
    elementId: string,
    method: InferenceLogEntry['method'],
    confidence: number,
  ): void {
    model.inferenceLog.push({
      timestamp: new Date(),
      elementType,
      elementId,
      method,
      confidence,
    });
  }

  /**
   * Calculate overall model confidence
   */
  private calculateOverallConfidence(model: SemanticModel): number {
    const scores: number[] = [];

    for (const entity of model.entityClasses.values()) {
      scores.push(entity.confidence);
    }
    for (const rel of model.relationships) {
      scores.push(rel.confidence);
    }
    for (const metric of model.metrics.values()) {
      scores.push(metric.confidence ?? 1.0);
    }
    for (const dim of model.dimensions.values()) {
      scores.push(dim.confidence ?? 1.0);
    }

    if (scores.length === 0) return 1.0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * Check if a column type is numeric
   */
  private isNumericType(type: string): boolean {
    const numericTypes = [
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
    return numericTypes.some((t) => type.includes(t));
  }

  /**
   * Check if a column type is categorical
   */
  private isCategoricalType(type: string): boolean {
    const categoricalTypes = ['varchar', 'char', 'text', 'string', 'enum'];
    return categoricalTypes.some((t) => type.includes(t));
  }

  /**
   * Check if a column is likely an ID/key
   */
  private isIdColumn(name: string): boolean {
    const lower = name.toLowerCase();
    return (
      lower === 'id' ||
      lower.endsWith('_id') ||
      lower.endsWith('id') ||
      lower === 'uuid' ||
      lower === 'code' ||
      lower.endsWith('_code')
    );
  }

  /**
   * Infer a good metric name from column name
   */
  private inferMetricName(columnName: string): string | null {
    const lower = columnName.toLowerCase();

    // Skip obvious non-metric columns
    if (
      lower.includes('id') ||
      lower.includes('_at') ||
      lower.includes('created') ||
      lower.includes('updated') ||
      lower.includes('deleted')
    ) {
      return null;
    }

    // Common metric patterns
    const metricPatterns: Record<string, string> = {
      amount: 'total_amount',
      total: 'total',
      price: 'total_price',
      cost: 'total_cost',
      revenue: 'revenue',
      sales: 'total_sales',
      quantity: 'total_quantity',
      qty: 'total_quantity',
      count: 'count',
      value: 'total_value',
    };

    for (const [pattern, name] of Object.entries(metricPatterns)) {
      if (lower.includes(pattern)) {
        return name;
      }
    }

    return null;
  }

  /**
   * Infer a metric from column information
   */
  private inferMetric(
    tableName: string,
    columnName: string,
    _columnType: string,
  ): Metric | null {
    const lower = columnName.toLowerCase();
    const fullColumn = `${tableName}.${columnName}`;

    // Determine aggregation and format
    let aggregation: Metric['aggregation'] = 'sum';
    let format: string | undefined;
    let dataType: Metric['dataType'] = 'number';

    if (
      lower.includes('count') ||
      lower.includes('qty') ||
      lower.includes('quantity')
    ) {
      aggregation = 'sum';
      dataType = 'integer';
    } else if (
      lower.includes('avg') ||
      lower.includes('average') ||
      lower.includes('rate')
    ) {
      aggregation = 'avg';
    } else if (
      lower.includes('price') ||
      lower.includes('cost') ||
      lower.includes('amount') ||
      lower.includes('revenue')
    ) {
      format = 'currency';
      dataType = 'decimal';
    } else if (lower.includes('percent') || lower.includes('ratio')) {
      format = 'percentage';
    }

    const metricName = this.inferMetricName(columnName);
    if (!metricName) return null;

    return createMetric({
      name: metricName,
      expression: `${aggregation?.toUpperCase() ?? 'SUM'}(${fullColumn})`,
      description: `Calculated ${metricName} from ${columnName}`,
      requiredTables: [tableName],
      dataType,
      format,
      aggregation,
    });
  }

  /**
   * Infer a dimension from column information
   */
  private inferDimension(
    tableName: string,
    columnName: string,
    columnType: string,
  ): Dimension | null {
    const lower = columnName.toLowerCase();
    const fullColumn = `${tableName}.${columnName}`;

    let cardinality: Dimension['cardinality'] = 'medium';
    let dataType: Dimension['dataType'] = 'string';
    let isPrimaryKey = false;
    let isForeignKey = false;

    // Detect primary keys
    if (lower === 'id' || lower === `${tableName.toLowerCase()}_id`) {
      isPrimaryKey = true;
      cardinality = 'high';
      dataType = columnType.includes('int') ? 'number' : 'string';
    }

    // Detect foreign keys
    if (lower.endsWith('_id') && lower !== 'id') {
      isForeignKey = true;
      cardinality = 'high';
      dataType = columnType.includes('int') ? 'number' : 'string';
    }

    // Date columns
    if (columnType.includes('date') || columnType.includes('time')) {
      dataType =
        columnType.includes('datetime') || columnType.includes('timestamp')
          ? 'datetime'
          : 'date';
      cardinality = 'high';
    }

    // Boolean columns
    if (
      columnType.includes('bool') ||
      lower.startsWith('is_') ||
      lower.startsWith('has_')
    ) {
      dataType = 'boolean';
      cardinality = 'low';
    }

    // Common low cardinality columns
    if (
      lower.includes('status') ||
      lower.includes('type') ||
      lower.includes('category') ||
      lower.includes('state') ||
      lower.includes('country') ||
      lower.includes('region')
    ) {
      cardinality = 'low';
    }

    return createDimension({
      name: columnName,
      column: fullColumn,
      table: tableName,
      cardinality,
      dataType,
      isPrimaryKey,
      isForeignKey,
    });
  }

  /**
   * Infer joins from foreign key patterns
   * Uses actual schema metadata to find target columns
   */
  private inferJoins(schema: SimpleSchema): JoinPath[] {
    const joins: JoinPath[] = [];

    // Build table name lookup (lowercase -> actual name)
    const tableNameMap = new Map<string, string>();
    for (const t of schema.tables) {
      tableNameMap.set(t.tableName.toLowerCase(), t.tableName);
    }

    // Build column lookup: tableName -> columnName -> columnInfo
    const columnMap = new Map<string, Map<string, { columnName: string }>>();
    for (const t of schema.tables) {
      const cols = new Map<string, { columnName: string }>();
      for (const c of t.columns) {
        cols.set(c.columnName.toLowerCase(), { columnName: c.columnName });
      }
      columnMap.set(t.tableName.toLowerCase(), cols);
    }

    for (const table of schema.tables) {
      const tableName = table.tableName;

      for (const column of table.columns) {
        const columnNameLower = column.columnName.toLowerCase();

        // Check for foreign key pattern: xxx_id
        if (columnNameLower.endsWith('_id') && columnNameLower !== 'id') {
          const referencedTable = columnNameLower.slice(0, -3); // Remove '_id'

          // Find target table (singular or plural)
          let targetTableName: string | undefined;
          let targetTableLower: string | undefined;

          if (tableNameMap.has(referencedTable)) {
            targetTableLower = referencedTable;
            targetTableName = tableNameMap.get(referencedTable);
          } else if (tableNameMap.has(`${referencedTable}s`)) {
            targetTableLower = `${referencedTable}s`;
            targetTableName = tableNameMap.get(`${referencedTable}s`);
          }

          if (!targetTableName || !targetTableLower) continue;

          // Skip self-joins (same table)
          if (targetTableName === tableName) continue;

          // Find the actual target column in the referenced table
          const targetColumns = columnMap.get(targetTableLower);
          if (!targetColumns) continue;

          // Priority order for finding the target column:
          // 1. Same name as the FK column (e.g., customer_id -> customer_id)
          // 2. {tableSingular}_id (e.g., customer_id in customers table)
          // 3. id
          let targetColumn: string | undefined;

          // Check for same name first
          if (targetColumns.has(columnNameLower)) {
            targetColumn = targetColumns.get(columnNameLower)!.columnName;
          }
          // Check for {singular}_id pattern in target table
          else if (targetColumns.has(`${referencedTable}_id`)) {
            targetColumn = targetColumns.get(
              `${referencedTable}_id`,
            )!.columnName;
          }
          // Fallback to 'id'
          else if (targetColumns.has('id')) {
            targetColumn = targetColumns.get('id')!.columnName;
          }

          if (!targetColumn) continue;

          joins.push(
            createJoinPath({
              fromTable: tableName,
              toTable: targetTableName,
              fromColumn: column.columnName,
              toColumn: targetColumn,
              type: 'left',
              cardinality: 'many_to_one',
            }),
          );
        }
      }
    }

    return joins;
  }

  /**
   * Add common business synonyms
   */
  private addCommonSynonyms(model: SemanticModel): void {
    const commonSynonyms: Record<string, string[]> = {
      revenue: ['sales', 'income', 'earnings'],
      amount: ['value', 'total', 'sum'],
      quantity: ['qty', 'count', 'number'],
      customer: ['client', 'buyer', 'account'],
      product: ['item', 'sku', 'goods'],
      order: ['purchase', 'transaction', 'sale'],
      date: ['day', 'time', 'when'],
      region: ['area', 'territory', 'zone'],
      category: ['type', 'group', 'segment'],
    };

    for (const [term, synonyms] of Object.entries(commonSynonyms)) {
      model.synonyms.set(term, synonyms);
    }
  }
}

export const semanticModelService = new SemanticModelService();
