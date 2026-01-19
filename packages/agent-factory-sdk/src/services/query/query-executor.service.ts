import type { AbstractQueryEngine } from '@qwery/domain/ports';
import type { Repositories } from '@qwery/domain/repositories';
import type { SchemaCacheManager } from '../../tools/schema-cache';
import { DuckDBQueryEngine } from '../duckdb-query-engine.service';
import {
  queryValidator,
  type ValidationResult,
} from './query-validator.service';
import {
  storeQueryResult,
  getCachedResult,
  getSchemaVersion,
} from '../../tools/query-result-cache';
import { getDatasourceDatabaseName } from '../../tools/datasource-name-utils';
import { datasourceOrchestrationService } from '../../tools/datasource-orchestration-service';
import type { LoadedDatasource } from '../../tools/datasource-loader';

export interface QueryExecutionOptions {
  conversationId: string;
  repositories: Repositories;
  queryEngine: AbstractQueryEngine;
  metadataDatasources?: string[];
  existingOrchestrationResult?: {
    workspace: string;
    schemaCache: SchemaCacheManager;
    datasources: LoadedDatasource[];
  };
  skipValidation?: boolean;
  allowDestructive?: boolean;
  useCache?: boolean;
  cacheTTLMs?: number;
}

export interface QueryExecutionResult {
  result: {
    columns: string[];
    rows: Array<Record<string, unknown>>;
  };
  queryId: string;
  validation: ValidationResult;
  executionTimeMs: number;
  cacheHit: boolean;
}

export class QueryExecutorService {
  /**
   * Execute a SQL query with validation and caching
   */
  async execute(
    query: string,
    options: QueryExecutionOptions,
  ): Promise<QueryExecutionResult> {
    const {
      conversationId,
      repositories,
      queryEngine,
      metadataDatasources,
      existingOrchestrationResult,
      skipValidation = false,
      allowDestructive = false,
      useCache = true,
      cacheTTLMs,
    } = options;

    const startTime = performance.now();

    // Check cache first (before orchestration for speed)
    if (useCache) {
      const schemaVersion = metadataDatasources?.[0]
        ? getSchemaVersion(metadataDatasources[0])
        : undefined;

      const cached = getCachedResult(conversationId, query, schemaVersion);
      if (cached) {
        return {
          result: {
            columns: cached.columns,
            rows: cached.rows,
          },
          queryId: `cached_${Date.now()}`,
          validation: { valid: true, errors: [], warnings: [], tablePaths: [] },
          executionTimeMs: performance.now() - startTime,
          cacheHit: true,
        };
      }
    }

    // Ensure datasources are attached
    const orchestration =
      await datasourceOrchestrationService.ensureAttachedAndCached(
        { conversationId, repositories, queryEngine, metadataDatasources },
        existingOrchestrationResult as
          | Awaited<
              ReturnType<typeof datasourceOrchestrationService.orchestrate>
            >
          | undefined,
      );

    const { schemaCache, datasources } = orchestration;

    // Get attached datasource names for validation
    const attachedDatasourceNames = datasources.map((d) =>
      getDatasourceDatabaseName(d.datasource),
    );

    // Validate query
    let validation: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      tablePaths: [],
    };

    if (!skipValidation) {
      validation = queryValidator.validate(query, schemaCache, {
        allowDestructive,
        attachedDatasourceNames,
      });

      if (!validation.valid) {
        const errorMessages = validation.errors
          .map((e) => {
            let msg = e.message;
            if (e.details?.suggestion) {
              msg += ` ${e.details.suggestion}`;
            }
            return msg;
          })
          .join('; ');
        throw new Error(`Query validation failed: ${errorMessages}`);
      }

      // Log warnings
      for (const warning of validation.warnings) {
        console.warn(`[QueryExecutor] Validation warning: ${warning}`);
      }
    }

    // Set up path mappings for query rewriting
    if (queryEngine instanceof DuckDBQueryEngine) {
      const pathMappings = new Map<string, string>();
      const allPaths = schemaCache.getAllTablePathsFromAllDatasources();

      for (const displayPath of allPaths) {
        const queryPath = schemaCache.getQueryPathForDisplayPath(displayPath);
        if (queryPath && queryPath !== displayPath) {
          pathMappings.set(displayPath, queryPath);
        }
      }

      queryEngine.setPathMappings(pathMappings, allPaths);
    }

    // Execute query
    const queryStartTime = performance.now();
    const result = await queryEngine.query(query);
    const queryTime = performance.now() - queryStartTime;

    // Convert columns to string array
    const columnNames = result.columns.map((col) =>
      typeof col === 'string' ? col : col.name || String(col),
    );

    // Get schema version for cache invalidation
    const schemaVersion = metadataDatasources?.[0]
      ? getSchemaVersion(metadataDatasources[0])
      : undefined;

    // Store results in cache
    const queryId = storeQueryResult(
      conversationId,
      query,
      columnNames,
      result.rows,
      { ttlMs: cacheTTLMs, schemaVersion },
    );

    const totalTime = performance.now() - startTime;
    console.log(
      `[QueryExecutor] Query executed in ${totalTime.toFixed(2)}ms (query: ${queryTime.toFixed(2)}ms, rows: ${result.rows.length})`,
    );

    return {
      result: {
        columns: columnNames,
        rows: result.rows,
      },
      queryId,
      validation,
      executionTimeMs: totalTime,
      cacheHit: false,
    };
  }
}

export const queryExecutor = new QueryExecutorService();
