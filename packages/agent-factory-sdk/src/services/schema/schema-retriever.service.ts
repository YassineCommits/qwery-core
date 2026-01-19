import type {
  SimpleSchema,
  SimpleTable,
  SemanticModel,
} from '@qwery/domain/entities';
import type { AbstractQueryEngine } from '@qwery/domain/ports';
import type { Repositories } from '@qwery/domain/repositories';
import type { SchemaCacheManager } from '../../tools/schema-cache';
import { TransformMetadataToSimpleSchemaService } from '@qwery/domain/services';
import { getDatasourceDatabaseName } from '../../tools/datasource-name-utils';
import { datasourceOrchestrationService } from '../../tools/datasource-orchestration-service';
import type { LoadedDatasource } from '../../tools/datasource-loader';
import { semanticModelService } from '../semantic/semantic-model.service';

export interface SchemaRetrievalOptions {
  conversationId: string;
  repositories: Repositories;
  queryEngine: AbstractQueryEngine;
  metadataDatasources?: string[];
  existingOrchestrationResult?: {
    workspace: string;
    schemaCache: SchemaCacheManager;
    datasources: LoadedDatasource[];
  };
}

export interface SchemaRetrievalResult {
  schema: SimpleSchema;
  allTables: string[];
  tableCount: number;
  businessContext: {
    domain: string;
    entities: Array<{ name: string; columns: string[] }>;
    relationships: Array<{ from: string; to: string; join: string }>;
    vocabulary: Record<string, unknown>;
  };
  orchestration: {
    workspace: string;
    schemaCache: SchemaCacheManager;
    datasources: LoadedDatasource[];
  };
}

export class SchemaRetrieverService {
  /**
   * Retrieve schema information for tables/views
   * Handles cache lookup, metadata transformation, and business context building
   */
  async retrieve(
    options: SchemaRetrievalOptions,
    requestedViews?: string[],
  ): Promise<SchemaRetrievalResult> {
    const {
      conversationId,
      repositories,
      queryEngine,
      metadataDatasources,
      existingOrchestrationResult,
    } = options;

    const startTime = performance.now();

    // Ensure datasources are attached and cached
    const orchestration =
      await datasourceOrchestrationService.ensureAttachedAndCached(
        { conversationId, repositories, queryEngine, metadataDatasources },
        existingOrchestrationResult as
          | Awaited<
              ReturnType<typeof datasourceOrchestrationService.orchestrate>
            >
          | undefined,
      );

    const {
      workspace,
      schemaCache,
      datasources: allDatasources,
    } = orchestration;

    // Get schemas from cache or query engine
    let collectedSchemas = await this.getSchemas(
      queryEngine,
      schemaCache,
      allDatasources,
    );

    // Filter by requested views if provided
    if (requestedViews && requestedViews.length > 0) {
      collectedSchemas = this.filterSchemas(collectedSchemas, requestedViews);
    }

    // Build semantic model from schema (replaces BusinessContext)
    const combinedSchema = this.combineSchemas(
      collectedSchemas,
      requestedViews,
    );
    const semanticModel = semanticModelService.buildFromSchema(
      conversationId,
      combinedSchema,
    );

    // Get all table names
    const allTableNames = this.extractTableNames(collectedSchemas);

    const totalTime = performance.now() - startTime;
    console.log(
      `[SchemaRetriever] Retrieved schema in ${totalTime.toFixed(2)}ms (${allTableNames.length} tables)`,
    );

    return {
      schema: combinedSchema,
      allTables: allTableNames,
      tableCount: allTableNames.length,
      businessContext:
        this.extractBusinessContextFromSemanticModel(semanticModel),
      orchestration: {
        workspace,
        schemaCache,
        datasources: allDatasources,
      },
    };
  }

  /**
   * Extract legacy businessContext structure from SemanticModel for backward compatibility
   */
  private extractBusinessContextFromSemanticModel(
    model: SemanticModel,
  ): SchemaRetrievalResult['businessContext'] {
    return {
      domain: model.domainClassification?.domain ?? 'general',
      entities: Array.from(model.entityClasses.values())
        .slice(0, 20)
        .map((e) => ({
          name: e.name,
          columns: e.requiredProperties.concat(e.optionalProperties),
        })),
      relationships: model.relationships.slice(0, 30).map((r) => ({
        from: r.fromEntity,
        to: r.toEntity,
        join: r.joinCondition,
      })),
      vocabulary: Object.fromEntries(
        Array.from(model.synonyms.entries()).slice(0, 100),
      ),
    };
  }

  /**
   * Get schemas from cache or query engine
   */
  private async getSchemas(
    queryEngine: AbstractQueryEngine,
    schemaCache: SchemaCacheManager,
    allDatasources: LoadedDatasource[],
  ): Promise<Map<string, SimpleSchema>> {
    const allCached =
      allDatasources.length > 0 &&
      allDatasources.every(({ datasource }) =>
        schemaCache.isCached(datasource.id),
      );

    if (allCached && allDatasources.length > 0) {
      console.log(
        `[SchemaRetriever] Using cached schema for ${allDatasources.length} datasource(s)`,
      );
      return schemaCache.toSimpleSchemas(
        allDatasources.map((d) => d.datasource.id),
      );
    }

    console.log(`[SchemaRetriever] Cache miss, querying DuckDB metadata...`);

    const datasourceDatabaseMap = new Map<string, string>();
    const datasourceProviderMap = new Map<string, string>();

    for (const { datasource } of allDatasources) {
      const dbName = getDatasourceDatabaseName(datasource);
      datasourceDatabaseMap.set(datasource.id, dbName);
      datasourceProviderMap.set(datasource.id, datasource.datasource_provider);
    }

    const metadata = await queryEngine.metadata(
      allDatasources.length > 0
        ? allDatasources.map((d) => d.datasource)
        : undefined,
    );

    const transformService = new TransformMetadataToSimpleSchemaService();
    return transformService.execute({
      metadata,
      datasourceDatabaseMap,
      datasourceProviderMap,
    });
  }

  /**
   * Filter schemas by requested views
   */
  private filterSchemas(
    schemas: Map<string, SimpleSchema>,
    requestedViews: string[],
  ): Map<string, SimpleSchema> {
    const filteredSchemas = new Map<string, SimpleSchema>();

    for (const viewId of requestedViews) {
      const { db, schema: schemaName, table } = this.parseViewId(viewId);

      // Try to find matching schema
      let foundSchema: SimpleSchema | undefined;
      let foundKey: string | undefined;

      // Try exact schema key match
      const schemaKey = `${db}.${schemaName}`;
      foundSchema = schemas.get(schemaKey);
      if (foundSchema) foundKey = schemaKey;

      // Try with main schema
      if (!foundSchema && db !== 'main') {
        const mainSchemaKey = `${db}.main`;
        foundSchema = schemas.get(mainSchemaKey);
        if (foundSchema) foundKey = mainSchemaKey;
      }

      // Search by table name across all schemas
      if (!foundSchema) {
        for (const [key, schemaData] of schemas.entries()) {
          for (const t of schemaData.tables) {
            if (this.tableMatches(t.tableName, table, viewId)) {
              foundSchema = schemaData;
              foundKey = key;
              break;
            }
          }
          if (foundSchema) break;
        }
      }

      if (foundSchema && foundKey) {
        const filteredTables = foundSchema.tables.filter((t) =>
          this.tableMatches(t.tableName, table, viewId),
        );

        if (filteredTables.length > 0) {
          filteredSchemas.set(viewId, {
            ...foundSchema,
            tables: filteredTables,
          });
        } else {
          filteredSchemas.set(viewId, foundSchema);
        }
      }
    }

    return filteredSchemas;
  }

  /**
   * Parse a view ID into components
   */
  private parseViewId(viewId: string): {
    db: string;
    schema: string;
    table: string;
  } {
    let db = 'main';
    let schema = 'main';
    let table = viewId;

    if (viewId.includes('.')) {
      const parts = viewId.split('.');
      if (parts.length === 3) {
        db = parts[0] ?? db;
        schema = parts[1] ?? schema;
        table = parts[2] ?? table;
      } else if (parts.length === 2) {
        db = parts[0] ?? db;
        table = parts[1] ?? table;
        schema = 'main';
      }
    }

    return { db, schema, table };
  }

  /**
   * Check if a table name matches the search criteria
   */
  private tableMatches(
    tableName: string,
    table: string,
    viewId: string,
  ): boolean {
    return (
      tableName === table ||
      tableName === viewId ||
      tableName.endsWith(`.${table}`) ||
      tableName.endsWith(`.${viewId}`) ||
      (viewId.includes('.') && tableName === viewId)
    );
  }

  /**
   * Combine multiple schemas into one
   */
  private combineSchemas(
    schemas: Map<string, SimpleSchema>,
    requestedViews?: string[],
  ): SimpleSchema {
    if (requestedViews?.length === 1) {
      const singleView = requestedViews[0] ?? '';
      const foundSchema = schemas.get(singleView);
      if (foundSchema) return foundSchema;
    }

    const allTables: SimpleTable[] = [];
    for (const schemaData of schemas.values()) {
      allTables.push(...schemaData.tables);
    }

    const firstSchema = schemas.values().next().value;
    return {
      databaseName: firstSchema?.databaseName || 'main',
      schemaName: firstSchema?.schemaName || 'main',
      tables: allTables,
    };
  }

  /**
   * Extract all table names from schemas
   */
  private extractTableNames(schemas: Map<string, SimpleSchema>): string[] {
    const names: string[] = [];
    for (const schemaData of schemas.values()) {
      for (const table of schemaData.tables) {
        names.push(table.tableName);
      }
    }
    return names;
  }
}

export const schemaRetriever = new SchemaRetrieverService();
