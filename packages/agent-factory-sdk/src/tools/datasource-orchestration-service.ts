import type { Repositories } from '@qwery/domain/repositories';
import { GetConversationBySlugService } from '@qwery/domain/services';
import type { AbstractQueryEngine } from '@qwery/domain/ports';
import { loadDatasources, type LoadedDatasource } from './datasource-loader';
import { getSchemaCache, type SchemaCacheManager } from './schema-cache';
import { getDatasourceDatabaseName } from './datasource-name-utils';
import type { ConversationOutput } from '@qwery/domain/usecases';

// Lazy workspace resolution - only resolve when actually needed
let WORKSPACE_CACHE: string | undefined;

function resolveWorkspaceDir(): string | undefined {
  const globalProcess =
    typeof globalThis !== 'undefined'
      ? (globalThis as { process?: NodeJS.Process }).process
      : undefined;
  const envValue =
    globalProcess?.env?.WORKSPACE ??
    globalProcess?.env?.VITE_WORKING_DIR ??
    globalProcess?.env?.WORKING_DIR;
  if (envValue) {
    return envValue;
  }

  try {
    return (import.meta as { env?: Record<string, string> })?.env
      ?.VITE_WORKING_DIR;
  } catch {
    return undefined;
  }
}

function getWorkspace(): string | undefined {
  if (WORKSPACE_CACHE === undefined) {
    WORKSPACE_CACHE = resolveWorkspaceDir();
  }
  return WORKSPACE_CACHE;
}

/**
 * Prioritize datasources: metadata datasources take precedence over conversation datasources
 */
export function prioritizeDatasources(
  metadataDatasources?: string[],
  conversationDatasources?: string[],
): string[] {
  if (metadataDatasources && metadataDatasources.length > 0) {
    return metadataDatasources;
  }
  return conversationDatasources || [];
}

export interface DatasourceOrchestrationResult {
  conversation: ConversationOutput | null;
  datasources: LoadedDatasource[];
  workspace: string;
  schemaCache: SchemaCacheManager;
  attached: boolean;
}

export interface DatasourceOrchestrationOptions {
  conversationId: string;
  repositories: Repositories;
  queryEngine: AbstractQueryEngine;
  metadataDatasources?: string[];
}

/**
 * Unified service for orchestrating datasource operations:
 * - Conversation retrieval
 * - Datasource loading and prioritization
 * - Attachment coordination
 * - Schema cache management
 * - Workspace resolution
 */
export class DatasourceOrchestrationService {
  /**
   * Orchestrate all datasource operations for agent initialization
   */
  async orchestrate(
    options: DatasourceOrchestrationOptions,
  ): Promise<DatasourceOrchestrationResult> {
    const { conversationId, repositories, queryEngine, metadataDatasources } =
      options;

    const workspace = getWorkspace();
    if (!workspace) {
      throw new Error('WORKSPACE environment variable is not set');
    }

    const getConversationService = new GetConversationBySlugService(
      repositories.conversation,
    );
    let conversation: ConversationOutput | null = null;
    try {
      conversation = await getConversationService.execute(conversationId);
    } catch (error) {
      console.warn(
        `[DatasourceOrchestration] Conversation ${conversationId} not found:`,
        error,
      );
    }

    const datasourcesToUse = prioritizeDatasources(
      metadataDatasources,
      conversation?.datasources,
    );

    const schemaCache = getSchemaCache(conversationId);

    // Initialize engine (idempotent - safe to call multiple times)
    await queryEngine.initialize({
      workingDir: 'file://',
      config: {},
    });

    let attached = false;
    if (datasourcesToUse.length > 0) {
      try {
        const loaded = await loadDatasources(
          datasourcesToUse,
          repositories.datasource,
        );

        if (loaded.length > 0) {
          // Attach all datasources (will continue on individual failures)
          await queryEngine.attach(
            loaded.map((d) => d.datasource),
            {
              conversationId,
              workspace,
            },
          );
          await queryEngine.connect();
          attached = true;

          const uncachedDatasources = loaded.filter(
            ({ datasource }) => !schemaCache.isCached(datasource.id),
          );

          if (uncachedDatasources.length > 0) {
            const metadata = await queryEngine.metadata(
              uncachedDatasources.map((d) => d.datasource),
            );

            for (const { datasource } of uncachedDatasources) {
              const dbName = getDatasourceDatabaseName(datasource);
              await schemaCache.loadSchemaForDatasource(
                datasource.id,
                metadata,
                datasource.datasource_provider,
                dbName,
              );
            }
          }

          return {
            conversation,
            datasources: loaded,
            workspace,
            schemaCache,
            attached: true,
          };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[DatasourceOrchestration] Failed to attach datasources:`,
          errorMsg,
        );
      }
    } else {
      await queryEngine.connect();
    }

    return {
      conversation,
      datasources: [],
      workspace,
      schemaCache,
      attached,
    };
  }

  /**
   * Ensure datasources are attached and cached (for tools that need to sync)
   */
  async ensureAttachedAndCached(
    options: DatasourceOrchestrationOptions,
    existingResult?: DatasourceOrchestrationResult,
  ): Promise<DatasourceOrchestrationResult> {
    const { conversationId, repositories, queryEngine, metadataDatasources } =
      options;

    if (!existingResult) {
      return this.orchestrate(options);
    }

    const schemaCache = existingResult.schemaCache;
    const datasourcesToUse = prioritizeDatasources(
      metadataDatasources,
      existingResult.conversation?.datasources,
    );

    if (datasourcesToUse.length === 0) {
      return existingResult;
    }

    const loaded = await loadDatasources(
      datasourcesToUse,
      repositories.datasource,
    );

    if (loaded.length === 0) {
      return existingResult;
    }

    // Invalidate cache for datasources that are no longer in use
    const cachedDatasourceIds = schemaCache.getDatasources();
    const currentDatasourceIds = new Set(loaded.map((d) => d.datasource.id));
    for (const cachedId of cachedDatasourceIds) {
      if (!currentDatasourceIds.has(cachedId)) {
        schemaCache.invalidate(cachedId);
      }
    }

    // Find uncached datasources that need metadata
    const uncachedDatasources = loaded.filter(
      ({ datasource }) => !schemaCache.isCached(datasource.id),
    );

    // Attach datasources (idempotent - safe to call for already-attached)
    await queryEngine.attach(
      loaded.map((d) => d.datasource),
      {
        conversationId,
        workspace: existingResult.workspace,
      },
    );

    // Load metadata for uncached datasources only
    if (uncachedDatasources.length > 0) {
      const metadata = await queryEngine.metadata(
        uncachedDatasources.map((d) => d.datasource),
      );

      for (const { datasource } of uncachedDatasources) {
        const dbName = getDatasourceDatabaseName(datasource);
        await schemaCache.loadSchemaForDatasource(
          datasource.id,
          metadata,
          datasource.datasource_provider,
          dbName,
        );
      }
    }

    return {
      ...existingResult,
      datasources: loaded,
    };
  }
}

// Export singleton instance
export const datasourceOrchestrationService =
  new DatasourceOrchestrationService();
