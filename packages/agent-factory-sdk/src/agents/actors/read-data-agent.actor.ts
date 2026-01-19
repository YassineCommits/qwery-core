import { z } from 'zod';
import {
  Experimental_Agent as Agent,
  convertToModelMessages,
  UIMessage,
  tool,
  validateUIMessages,
  stepCountIs,
} from 'ai';
import { fromPromise } from 'xstate/actors';
import { resolveModel } from '../../services';
import { testConnection } from '../../tools/test-connection';
import type {
  SimpleSchema,
  SimpleTable,
  Datasource,
} from '@qwery/domain/entities';
import { selectChartType, generateChart } from '../tools/generate-chart';
// deleteTable and renameTable are now methods on DuckDBQueryEngine
import {
  buildReadDataAgentPrompt,
  type SemanticContext,
} from '../prompts/read-data-agent.prompt';
import {
  semanticModelService,
  semanticLearningService,
} from '../../services/semantic';
import type { Repositories } from '@qwery/domain/repositories';
import { AbstractQueryEngine } from '@qwery/domain/ports';
import { DuckDBQueryEngine } from '../../services/duckdb-query-engine.service';
import { getDatasourceDatabaseName } from '../../tools/datasource-name-utils';
import { TransformMetadataToSimpleSchemaService } from '@qwery/domain/services';
import type { PromptSource } from '../../domain';
import { PROMPT_SOURCE } from '../../domain';
import {
  storeQueryResult,
  getQueryResult,
} from '../../tools/query-result-cache';
import { datasourceOrchestrationService } from '../../tools/datasource-orchestration-service';
import { queryValidator } from '../../services/query';
import {
  indexSchemasForConversation,
  indexSemanticModelForConversation,
  indexQueryPatternForConversation,
  indexSchemaDiscoveryForConversation,
  indexQueryResultForConversation,
  retrieveRelevantContext,
  buildOptimizedContext,
} from '../../services/rag';
import { FeatureFlags } from '../../services/feature-flags';

/**
 * Extract datasource IDs from message metadata
 */
function extractDatasourcesFromMessages(
  messages: UIMessage[],
): string[] | undefined {
  if (!messages || messages.length === 0) {
    return undefined;
  }

  // Find the last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && message.role === 'user' && message.metadata) {
      const metadata = message.metadata as Record<string, unknown>;
      const datasources = metadata.datasources;
      if (
        Array.isArray(datasources) &&
        datasources.length > 0 &&
        datasources.every((ds) => typeof ds === 'string')
      ) {
        return datasources as string[];
      }
    }
  }

  return undefined;
}

export const readDataAgent = async (
  conversationId: string,
  messages: UIMessage[],
  model: string,
  queryEngine: AbstractQueryEngine,
  repositories?: Repositories,
  promptSource?: PromptSource,
  intent?: {
    intent: string;
    complexity: string;
    needsChart: boolean;
    needsSQL: boolean;
  },
) => {
  const needSQL = intent?.needsSQL ?? false;
  const needChart = intent?.needsChart ?? false;

  // Extract datasources from message metadata (prioritized)
  const metadataDatasources = extractDatasourcesFromMessages(messages);

  // Initialize engine and attach datasources if repositories are provided
  let orchestrationResult: Awaited<
    ReturnType<typeof datasourceOrchestrationService.orchestrate>
  > | null = null;

  if (repositories && queryEngine) {
    try {
      orchestrationResult = await datasourceOrchestrationService.orchestrate({
        conversationId,
        repositories,
        queryEngine,
        metadataDatasources,
      });
    } catch (error) {
      // Log but don't fail - datasources might not be available yet
      console.warn(
        `[ReadDataAgent] Failed to initialize engine or datasources:`,
        error,
      );
    }
  }

  // Build prompt with attached datasources information
  // Use orchestration result if available
  const attachedDatasources: Datasource[] =
    orchestrationResult?.datasources.map((d) => d.datasource) || [];

  // Log feature flag status
  const ragStatus = FeatureFlags.getStatus();
  if (
    ragStatus.schemaEmbedding ||
    ragStatus.retrieval ||
    ragStatus.optimizedPrompt ||
    ragStatus.crag
  ) {
    console.log(
      `[ReadDataAgent] RAG Features: embedding=${ragStatus.schemaEmbedding}, retrieval=${ragStatus.retrieval}, optimizedPrompt=${ragStatus.optimizedPrompt}, crag=${ragStatus.crag}`,
    );
  }

  // Automatic RAG retrieval: Get relevant context for the user's query
  let ragContext: string | undefined;
  if (ragStatus.retrieval) {
    // Extract user's query from last message (using reverse loop for ES2022 compatibility)
    let lastUserMessage: (typeof messages)[number] | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        lastUserMessage = messages[i];
        break;
      }
    }
    if (lastUserMessage?.parts) {
      const textPart = lastUserMessage.parts.find(
        (p: { type: string }) => p.type === 'text',
      );
      if (textPart && 'text' in textPart) {
        const userQuery = textPart.text;

        // Strip context wrapper if present
        const cleanQuery = userQuery
          .replace(/__QWERY_CONTEXT__[\s\S]*?__QWERY_CONTEXT_END__/, '')
          .trim();

        if (cleanQuery) {
          const retrievedDocs = await retrieveRelevantContext(
            conversationId,
            cleanQuery,
            10,
          );
          if (retrievedDocs.length > 0) {
            ragContext = buildOptimizedContext(retrievedDocs) ?? undefined;
            console.log(
              `[ReadDataAgent] RAG Retrieved ${retrievedDocs.length} docs for: "${cleanQuery.substring(0, 50)}..."`,
            );
          }
        }
      }
    }
  }

  // Build semantic context from cached model if available
  let semanticContext: SemanticContext | undefined;
  // Use metadata datasource ID, fall back to loaded datasource ID (fixes __QWERY_CONTEXT__ suggestions)
  const loadedDatasourceId = attachedDatasources[0]?.id;
  const primaryDatasourceId = metadataDatasources?.[0] ?? loadedDatasourceId;

  if (primaryDatasourceId) {
    const cachedModel = semanticModelService.getCached(primaryDatasourceId);
    if (cachedModel) {
      semanticContext = {
        entities: Array.from(cachedModel.entityClasses.values())
          .slice(0, 10)
          .map((e) => ({
            name: e.name,
            table: e.sourceTable,
            domain: e.domain,
          })),
        metrics: Array.from(cachedModel.metrics.values())
          .slice(0, 5)
          .map((m) => ({
            name: m.name,
            expression: m.expression,
            description: m.description,
          })),
        dimensions: Array.from(cachedModel.dimensions.values())
          .slice(0, 8)
          .map((d) => ({
            name: d.name,
            column: d.column,
            type: d.dimensionType ?? 'categorical',
          })),
        relationships: cachedModel.relationships.slice(0, 5).map((r) => ({
          from: r.fromEntity,
          to: r.toEntity,
          joinCondition: r.joinCondition,
        })),
        vocabulary: Array.from(cachedModel.synonyms.entries())
          .slice(0, 5)
          .map(([term, synonyms]) => ({ term, synonyms })),
      };
      console.log(
        `[ReadDataAgent] Using cached semantic context: ${semanticContext.entities.length} entities`,
      );
    }
  }

  const agentPrompt = buildReadDataAgentPrompt(
    attachedDatasources,
    ragContext,
    semanticContext,
  );

  // Build dynamic tool descriptions based on semantic context
  const dynamicDescriptions = {
    getSchema: semanticContext?.entities.length
      ? `Get schema info. Already discovered ${semanticContext.entities.length} tables: ${semanticContext.entities.map((e) => e.name).join(', ')}. Call to refresh or discover additional tables.`
      : 'Get schema information (columns, data types, business context) for specific tables/views. Returns column names, types, and business context for the specified tables.',
    runQuery: semanticContext?.entities.length
      ? `Execute SQL query. Available tables: ${semanticContext.entities.map((e) => e.table).join(', ')}.${semanticContext.metrics.length ? ` Key metrics: ${semanticContext.metrics.map((m) => m.name).join(', ')}.` : ''}`
      : 'Execute a SQL query against DuckDB. Call getSchema first if you need to discover available tables.',
  };

  const result = new Agent({
    model: await resolveModel(model),
    system: agentPrompt,
    tools: {
      testConnection: tool({
        description:
          'Test the connection to the database to check if the database is accessible',
        inputSchema: z.object({}),
        execute: async () => {
          const workspace =
            orchestrationResult?.workspace ||
            (() => {
              throw new Error('WORKSPACE environment variable is not set');
            })();
          const { join } = await import('node:path');
          const dbPath = join(workspace, conversationId, 'database.db');
          const result = await testConnection({
            dbPath: dbPath,
          });
          return result.toString();
        },
      }),
      getSchema: tool({
        description: dynamicDescriptions.getSchema,
        inputSchema: z.object({
          viewName: z.string().optional(),
          viewNames: z.array(z.string()).optional(),
        }),
        execute: async ({ viewName, viewNames }) => {
          // If both viewName and viewNames provided, prefer viewNames (array)
          const requestedViews = viewNames?.length
            ? viewNames
            : viewName
              ? [viewName]
              : undefined;

          if (!queryEngine) {
            throw new Error('Query engine not available');
          }

          if (!repositories) {
            throw new Error('Repositories not available');
          }

          // Use orchestration service to ensure datasources are attached and cached
          const orchestration =
            await datasourceOrchestrationService.ensureAttachedAndCached(
              {
                conversationId,
                repositories,
                queryEngine,
                metadataDatasources,
              },
              orchestrationResult || undefined,
            );

          const workspace = orchestration.workspace;
          const schemaCache = orchestration.schemaCache;
          const allDatasources = orchestration.datasources;

          const { join } = await import('node:path');
          const fileDir = join(workspace, conversationId);
          const dbPath = join(fileDir, 'database.duckdb');

          console.log(
            `[ReadDataAgent] Workspace: ${workspace}, ConversationId: ${conversationId}, dbPath: ${dbPath}`,
          );

          // Get metadata from cache or query engine
          let collectedSchemas: Map<string, SimpleSchema> = new Map();

          try {
            // Check if we can use cache
            const allCached =
              allDatasources.length > 0 &&
              allDatasources.every(({ datasource }) =>
                schemaCache.isCached(datasource.id),
              );

            if (allCached && allDatasources.length > 0) {
              collectedSchemas = schemaCache.toSimpleSchemas(
                allDatasources.map((d) => d.datasource.id),
              );
            } else {
              // Fallback to querying DuckDB (for main database or uncached datasources)
              // Build datasource database map and provider map for transformation
              const datasourceDatabaseMap = new Map<string, string>();
              const datasourceProviderMap = new Map<string, string>();
              for (const { datasource } of allDatasources) {
                const dbName = getDatasourceDatabaseName(datasource);
                datasourceDatabaseMap.set(datasource.id, dbName);
                datasourceProviderMap.set(
                  datasource.id,
                  datasource.datasource_provider,
                );
              }

              // Get metadata from query engine
              const metadata = await queryEngine.metadata(
                allDatasources.length > 0
                  ? allDatasources.map((d) => d.datasource)
                  : undefined,
              );

              // Transform metadata to SimpleSchema format using domain service
              const transformService =
                new TransformMetadataToSimpleSchemaService();
              collectedSchemas = await transformService.execute({
                metadata,
                datasourceDatabaseMap,
                datasourceProviderMap,
              });
            }

            // Filter by requested views if provided
            if (requestedViews && requestedViews.length > 0) {
              const filteredSchemas = new Map<string, SimpleSchema>();
              for (const viewId of requestedViews) {
                let foundSchema: SimpleSchema | undefined;
                let foundKey: string | undefined;

                // Parse viewId to extract database, schema, and table
                let db = 'main';
                let schema = 'main';
                let table = viewId;
                if (viewId.includes('.')) {
                  const parts = viewId.split('.');
                  if (parts.length === 3) {
                    // Format: datasourcename.schema.tablename
                    db = parts[0] ?? db;
                    schema = parts[1] ?? schema;
                    table = parts[2] ?? table;
                  } else if (parts.length === 2) {
                    // Format: datasourcename.tablename
                    db = parts[0] ?? db;
                    table = parts[1] ?? table;
                    schema = 'main'; // Default to main schema
                  }
                }

                // Try exact schema key match first
                const schemaKey = `${db}.${schema}`;
                foundSchema = collectedSchemas.get(schemaKey);
                if (foundSchema) {
                  foundKey = schemaKey;
                }

                // If not found, try with main schema
                if (!foundSchema && db !== 'main') {
                  const mainSchemaKey = `${db}.main`;
                  foundSchema = collectedSchemas.get(mainSchemaKey);
                  if (foundSchema) {
                    foundKey = mainSchemaKey;
                  }
                }

                // If still not found, search by table name across all schemas
                if (!foundSchema) {
                  for (const [key, schemaData] of collectedSchemas.entries()) {
                    for (const t of schemaData.tables) {
                      // Check if table name matches (handle both formatted and simple names)
                      // Table names in cache are formatted (e.g., "datasource.schema.table")
                      const tableNameMatch =
                        t.tableName === table ||
                        t.tableName === viewId ||
                        t.tableName.endsWith(`.${table}`) ||
                        t.tableName.endsWith(`.${viewId}`) ||
                        (viewId.includes('.') && t.tableName === viewId);
                      if (tableNameMatch) {
                        foundSchema = schemaData;
                        foundKey = key;
                        break;
                      }
                    }
                    if (foundSchema) break;
                  }
                }

                if (foundSchema && foundKey) {
                  // Create a filtered schema with only the matching table
                  // Table names in cache are formatted (e.g., "datasource.schema.table" or "datasource.table")
                  // Match against both the full formatted name and the simple table name
                  const filteredTables = foundSchema.tables.filter((t) => {
                    // Exact matches
                    if (t.tableName === table || t.tableName === viewId) {
                      return true;
                    }
                    // Match formatted names: "datasource.schema.table" or "datasource.table"
                    if (
                      t.tableName.endsWith(`.${table}`) ||
                      t.tableName.endsWith(`.${viewId}`)
                    ) {
                      return true;
                    }
                    // Match if viewId is a full path and tableName contains it
                    if (viewId.includes('.') && t.tableName === viewId) {
                      return true;
                    }
                    return false;
                  });

                  if (filteredTables.length > 0) {
                    filteredSchemas.set(viewId, {
                      ...foundSchema,
                      tables: filteredTables,
                    });
                  } else {
                    // If no matching table found, use the whole schema
                    filteredSchemas.set(viewId, foundSchema);
                  }
                } else {
                  console.warn(
                    `[ReadDataAgent] View "${viewId}" not found in metadata, skipping`,
                  );
                }
              }
              collectedSchemas = filteredSchemas;
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            console.error(
              `[ReadDataAgent] Failed to get metadata: ${errorMsg}`,
              error,
            );
            throw error;
          }

          // Limit configuration for semantic model extraction
          const maxEntities = 20;
          const maxRelationships = 30;
          const maxVocabulary = 100;

          // If specific views requested, return those schemas
          // Otherwise, return ALL schemas combined
          let schema: SimpleSchema;
          if (
            requestedViews &&
            requestedViews.length > 0 &&
            requestedViews.length === 1
          ) {
            const singleView = requestedViews[0] ?? '';
            if (!singleView) {
              schema = {
                databaseName: 'main',
                schemaName: 'main',
                tables: [],
              };
            } else {
              // Try exact match first
              let foundSchema = collectedSchemas.get(singleView);

              // If not found and it's a 2-part name (datasourcename.tablename), try with main schema
              if (
                !foundSchema &&
                singleView.includes('.') &&
                singleView.split('.').length === 2
              ) {
                const parts = singleView.split('.');
                const withMainSchema = `${parts[0]}.main.${parts[1]}`;
                foundSchema = collectedSchemas.get(withMainSchema);
              }

              if (foundSchema) {
                // Single view requested - format table name to include schema
                const schemaKey = Array.from(collectedSchemas.entries()).find(
                  ([_, s]) => s === foundSchema,
                )?.[0];
                if (schemaKey && schemaKey.includes('.')) {
                  const parts = schemaKey.split('.');
                  if (parts.length >= 3) {
                    // Format table name as datasourcename.schema.tablename
                    foundSchema = {
                      ...foundSchema,
                      tables: foundSchema.tables.map((t) => ({
                        ...t,
                        tableName: `${parts[0]}.${parts[1]}.${t.tableName}`,
                      })),
                    };
                  }
                }
                schema = foundSchema;
              } else {
                // View not found, return empty schema
                schema = {
                  databaseName: 'main',
                  schemaName: 'main',
                  tables: [],
                };
              }
            }
          } else {
            // All views - combine all schemas into one
            // Table names are already formatted in transformMetadataToSimpleSchema
            const allTables: SimpleTable[] = [];
            for (const [, schemaData] of collectedSchemas.entries()) {
              // Add tables from each schema (table names already formatted)
              allTables.push(...schemaData.tables);
            }

            // Determine primary database/schema from first entry or use defaults
            const firstSchema = collectedSchemas.values().next().value;
            schema = {
              databaseName: firstSchema?.databaseName || 'main',
              schemaName: firstSchema?.schemaName || 'main',
              tables: allTables,
            };
          }

          // Build semantic model from schema (with caching per datasource)
          // Use the loaded datasource ID to ensure consistency with cache lookup
          const primaryDatasourceId =
            allDatasources[0]?.datasource.id ?? conversationId;
          console.log(
            `[SemanticLayer] Building/caching for datasource: ${primaryDatasourceId}`,
          );
          const semanticModel = semanticModelService.getOrBuild(
            primaryDatasourceId,
            schema,
          );

          console.log(
            `[SemanticLayer] Model ready: ${semanticModel.entityClasses.size} entities, ${semanticModel.relationships.length} relationships, ${semanticModel.metrics.size} metrics, ${semanticModel.dimensions.size} dimensions, confidence: ${semanticModel.confidenceScore.toFixed(2)}`,
          );

          // Extract semantic layer information for response
          const entities = Array.from(semanticModel.entityClasses.values())
            .slice(0, maxEntities)
            .map((e) => ({
              name: e.name,
              sourceTable: e.sourceTable,
              domain: e.domain,
              properties: e.requiredProperties.concat(e.optionalProperties),
            }));
          const relationships = semanticModel.relationships
            .slice(0, maxRelationships)
            .map((r) => ({
              from: r.fromEntity,
              to: r.toEntity,
              type: r.type,
              joinCondition: r.joinCondition,
            }));
          const vocabulary = Object.fromEntries(
            Array.from(semanticModel.synonyms.entries()).slice(
              0,
              maxVocabulary,
            ),
          );

          // Include information about all discovered tables in the response
          // Extract table names from schemas (table names are already formatted)
          const allTableNames: string[] = [];
          for (const schemaData of collectedSchemas.values()) {
            for (const table of schemaData.tables) {
              allTableNames.push(table.tableName);
            }
          }
          const tableCount = allTableNames.length;

          // Phase 1: Index schemas for RAG if enabled
          if (FeatureFlags.useSchemaEmbedding) {
            const datasourceIds = allDatasources.map((d) => d.datasource.id);
            indexSchemasForConversation(
              conversationId,
              collectedSchemas,
              datasourceIds,
            ).catch(() => {
              // Indexing runs in background, don't block
            });

            // Index semantic model for RAG (replaces business context indexing)
            if (datasourceIds[0]) {
              console.log(`[SemanticLayer] Indexing semantic model for RAG...`);
              indexSemanticModelForConversation(
                conversationId,
                datasourceIds[0],
                semanticModel,
              ).catch((err) => {
                console.error(`[SemanticLayer] Failed to index: ${err}`);
              });
            }

            // Index schema discovery for conversational context
            const userContext =
              messages[messages.length - 1]?.parts?.[0]?.type === 'text'
                ? (
                    messages[messages.length - 1]?.parts?.[0] as {
                      text: string;
                    }
                  ).text
                : 'schema exploration';
            for (const table of schema.tables.slice(0, 5)) {
              indexSchemaDiscoveryForConversation(
                conversationId,
                table.tableName,
                table.columns.map((c) => ({
                  name: c.columnName,
                  type: c.columnType,
                })),
                userContext,
              ).catch(() => {});
            }
          }

          // Return schema and semantic layer insights
          return {
            schema: schema,
            allTables: allTableNames,
            tableCount: tableCount,
            businessContext: {
              domain: semanticModel.domainClassification?.domain ?? 'general',
              entities: entities.map((e) => ({
                name: e.name,
                columns: e.properties,
              })),
              relationships: relationships.map((r) => ({
                from: r.from,
                to: r.to,
                join: r.joinCondition,
              })),
              vocabulary: vocabulary,
            },
          };
        },
      }),
      retrieveContext: tool({
        description:
          "Retrieve relevant schema context for a query using semantic search. Use this before generating SQL to find the most relevant tables, columns, and relationships for the user's question. Returns optimized context that reduces token usage. Only available when retrieval is enabled.",
        inputSchema: z.object({
          query: z.string().describe('The user question or search query'),
          topK: z
            .number()
            .optional()
            .describe('Number of results to return (default: 10)'),
        }),
        execute: async ({ query, topK }) => {
          if (!FeatureFlags.useRetrieval) {
            return {
              enabled: false,
              message: 'Retrieval is not enabled. Use getSchema instead.',
            };
          }

          const retrievedDocs = await retrieveRelevantContext(
            conversationId,
            query,
            topK ?? 10,
          );

          if (retrievedDocs.length === 0) {
            return {
              enabled: true,
              found: 0,
              message:
                'No relevant context found. Try getSchema for full schema.',
            };
          }

          // Build optimized context if enabled
          const optimizedContext = buildOptimizedContext(retrievedDocs);

          return {
            enabled: true,
            found: retrievedDocs.length,
            context:
              optimizedContext ??
              retrievedDocs.map((d) => ({
                type: d.type,
                path: d.path,
                content: d.content,
              })),
          };
        },
      }),
      runQuery: tool({
        description: dynamicDescriptions.runQuery,
        inputSchema: z.object({
          query: z.string(),
        }),
        execute: async ({ query }) => {
          // TEMPORARY OVERRIDE: When needChart is true AND inline mode, execute query for chart generation
          const isChartRequestInInlineMode =
            needChart === true &&
            promptSource === PROMPT_SOURCE.INLINE &&
            needSQL === true;

          // Normal inline mode: skip execution, return SQL for pasting
          const shouldSkipExecution =
            promptSource === PROMPT_SOURCE.INLINE &&
            needSQL === true &&
            !isChartRequestInInlineMode;

          // If inline mode and needSQL is true (but NOT chart request), don't execute - return SQL for pasting
          if (shouldSkipExecution) {
            return {
              result: null,
              shouldPaste: true,
              sqlQuery: query,
            };
          }

          // Normal execution path for chat mode or when needSQL is false
          if (!queryEngine) {
            throw new Error('Query engine not available');
          }

          if (!repositories) {
            throw new Error('Repositories not available');
          }

          // Use orchestration service to ensure datasources are attached and cached
          const orchestration =
            await datasourceOrchestrationService.ensureAttachedAndCached(
              {
                conversationId,
                repositories,
                queryEngine,
                metadataDatasources,
              },
              orchestrationResult || undefined,
            );

          // Use QueryValidator service for comprehensive validation
          const schemaCache = orchestration.schemaCache;
          const attachedDatasourceNames = orchestration.datasources.map((d) =>
            getDatasourceDatabaseName(d.datasource),
          );

          const validationResult = queryValidator.validate(query, schemaCache, {
            allowDestructive: false,
            attachedDatasourceNames,
          });

          if (!validationResult.valid) {
            const errorMessages = validationResult.errors
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

          // Log warnings but don't block execution
          for (const warning of validationResult.warnings) {
            console.warn(`[runQuery] Validation warning: ${warning}`);
          }

          // Set path mappings on the query engine for automatic rewriting
          // This handles ClickHouse path conversion (default -> main) transparently
          if (queryEngine instanceof DuckDBQueryEngine) {
            // Build path mappings from schema cache
            const pathMappings = new Map<string, string>();
            const allPaths = schemaCache.getAllTablePathsFromAllDatasources();

            // Get all display paths and their corresponding query paths
            for (const displayPath of schemaCache.getAllTablePathsFromAllDatasources()) {
              const queryPath =
                schemaCache.getQueryPathForDisplayPath(displayPath);
              if (queryPath && queryPath !== displayPath) {
                pathMappings.set(displayPath, queryPath);
              }
            }

            queryEngine.setPathMappings(pathMappings, allPaths);
          }

          // Execute query with CRAG error recovery
          let result;
          try {
            result = await queryEngine.query(query);
          } catch (queryError) {
            const errorMsg =
              queryError instanceof Error
                ? queryError.message
                : String(queryError);

            // Learn from query failure
            const failedEntities = validationResult.tablePaths.map(
              (p) => p.split('.').pop() ?? p,
            );
            const cachedModel = primaryDatasourceId
              ? semanticModelService.getCached(primaryDatasourceId)
              : null;
            if (cachedModel) {
              semanticLearningService.learnFromFailure(
                cachedModel,
                messages[messages.length - 1]?.parts?.[0]?.type === 'text'
                  ? (
                      messages[messages.length - 1]?.parts?.[0] as {
                        text: string;
                      }
                    ).text
                  : '',
                query,
                errorMsg,
                failedEntities,
              );
            }

            // CRAG: Corrective RAG for query error recovery
            if (FeatureFlags.useCRAG) {
              // Try to retrieve relevant context to suggest corrections
              const corrections = await retrieveRelevantContext(
                conversationId,
                `${query} ${errorMsg}`,
                5,
              );

              if (corrections.length > 0) {
                const suggestions = corrections
                  .map((c) => c.content)
                  .join('\n  - ');
                throw new Error(
                  `Query failed: ${errorMsg}\n\nCRAG Suggestions (relevant schema elements):\n  - ${suggestions}`,
                );
              }
            }
            throw queryError;
          }

          // Learn from successful query execution
          const usedEntities = validationResult.tablePaths.map(
            (p) => p.split('.').pop() ?? p,
          );
          const userQueryText =
            messages[messages.length - 1]?.parts?.[0]?.type === 'text'
              ? (messages[messages.length - 1]?.parts?.[0] as { text: string })
                  .text
              : '';
          const cachedModel = primaryDatasourceId
            ? semanticModelService.getCached(primaryDatasourceId)
            : null;
          if (cachedModel && result.rows.length > 0) {
            semanticLearningService.learnFromSuccess(
              cachedModel,
              userQueryText,
              query,
              usedEntities,
            );
            // Persist the model to save learning
            semanticModelService.persistModel(primaryDatasourceId!);
            // Index query pattern for RAG boost
            indexQueryPatternForConversation(
              conversationId,
              userQueryText,
              query,
              usedEntities,
            ).catch(() => {}); // Non-blocking
          }

          // Index successful query result for conversational RAG
          const columnNames = result.columns.map((col) =>
            typeof col === 'string' ? col : col.name || String(col),
          );
          // Extract sample values from first few rows for context
          const sampleValues: Record<string, string[]> = {};
          for (const colName of columnNames.slice(0, 5)) {
            sampleValues[colName] = result.rows
              .slice(0, 3)
              .map((row) => String(row[colName] ?? ''))
              .filter((v) => v.length > 0 && v.length < 50);
          }
          // Detect aggregations from SQL
          const aggregations = (
            query.match(/\b(SUM|COUNT|AVG|MIN|MAX|GROUP BY)\b/gi) ?? []
          ).map((a) => a.toUpperCase());

          indexQueryResultForConversation(
            conversationId,
            query,
            {
              rowCount: result.rows.length,
              columns: columnNames,
              sampleValues,
              aggregations: [...new Set(aggregations)],
            },
            userQueryText,
          ).catch(() => {}); // Non-blocking

          // Store original query (not rewritten) for display
          const queryId = storeQueryResult(
            conversationId,
            query,
            columnNames,
            result.rows,
          );

          // Return full results for UI display, but agent should use queryId to avoid token waste
          // The prompt instructs the agent to ignore the full results and only use queryId
          const fullResult = {
            columns: columnNames,
            rows: result.rows,
          };

          if (isChartRequestInInlineMode) {
            // Chart request in inline mode: return full results + SQL for pasting
            return {
              result: fullResult,
              shouldPaste: true,
              sqlQuery: query,
              chartExecutionOverride: true,
              queryId, // Agent should use this, not the full results
            };
          }

          // Return full results for UI display
          // Agent prompt instructs to ignore full results and use queryId instead
          return {
            result: fullResult,
            queryId, // Agent should use this to retrieve results for tools
          };
        },
      }),
      renameTable: tool({
        description:
          'Rename a table/view to give it a more meaningful name. Both oldTableName and newTableName are required.',
        inputSchema: z.object({
          oldTableName: z.string(),
          newTableName: z.string(),
        }),
        execute: async ({ oldTableName, newTableName }) => {
          if (!queryEngine) {
            throw new Error('Query engine not available');
          }
          // Use queryEngine method directly
          if (!(queryEngine instanceof DuckDBQueryEngine)) {
            throw new Error('renameTable requires DuckDBQueryEngine');
          }
          const result = await queryEngine.renameTable(
            oldTableName,
            newTableName,
          );
          return result;
        },
      }),
      deleteTable: tool({
        description:
          'Delete one or more tables/views from the database. Takes an array of table names to delete.',
        inputSchema: z.object({
          tableNames: z.array(z.string()),
        }),
        execute: async ({ tableNames }) => {
          if (!queryEngine) {
            throw new Error('Query engine not available');
          }
          // Use queryEngine method directly
          if (!(queryEngine instanceof DuckDBQueryEngine)) {
            throw new Error('deleteTable requires DuckDBQueryEngine');
          }
          const result = await queryEngine.deleteTable(tableNames);
          return result;
        },
      }),
      selectChartType: tool({
        description:
          'Analyzes query results to determine the best chart type (bar, line, or pie) based on the data structure and user intent. Use this before generating a chart to select the most appropriate visualization type.',
        inputSchema: z.object({
          queryId: z
            .string()
            .optional()
            .describe(
              'Query ID from runQuery to retrieve full results from cache',
            ),
          queryResults: z
            .object({
              rows: z.array(z.record(z.unknown())),
              columns: z.array(z.string()),
            })
            .optional()
            .describe('Query results (optional if queryId is provided)'),
          sqlQuery: z.string().optional(),
          userInput: z.string().optional(),
        }),
        execute: async ({
          queryId,
          queryResults,
          sqlQuery = '',
          userInput = '',
        }) => {
          // If queryId is provided, retrieve full results from cache
          let fullQueryResults = queryResults;
          if (queryId) {
            const cachedResult = getQueryResult(conversationId, queryId);
            if (cachedResult) {
              fullQueryResults = {
                columns: cachedResult.columns,
                rows: cachedResult.rows,
              };
              console.log(
                `[selectChartType] Retrieved full results from cache: ${cachedResult.rows.length} rows`,
              );
            } else {
              console.warn(
                `[selectChartType] Query result not found in cache: ${queryId}, using provided queryResults`,
              );
            }
          }

          if (!fullQueryResults) {
            throw new Error('Either queryId or queryResults must be provided');
          }
          // Semantic model provides context via RAG, no need for businessContext param
          const result = await selectChartType(
            fullQueryResults,
            sqlQuery,
            userInput,
          );
          return result;
        },
      }),
      generateChart: tool({
        description:
          'Generates a chart configuration JSON for visualization. Takes query results and creates a chart (bar, line, or pie) with proper data transformation, colors, and labels. Use this after selecting a chart type or when the user requests a specific chart type.',
        inputSchema: z.object({
          chartType: z.enum(['bar', 'line', 'pie']).optional(),
          queryId: z
            .string()
            .optional()
            .describe(
              'Query ID from runQuery to retrieve full results from cache',
            ),
          queryResults: z
            .object({
              rows: z.array(z.record(z.unknown())),
              columns: z.array(z.string()),
            })
            .optional()
            .describe('Query results (optional if queryId is provided)'),
          sqlQuery: z.string().optional(),
          userInput: z.string().optional(),
        }),
        execute: async ({
          chartType,
          queryId,
          queryResults,
          sqlQuery = '',
          userInput = '',
        }) => {
          // If queryId is provided, retrieve full results from cache
          let fullQueryResults = queryResults;
          if (queryId) {
            const cachedResult = getQueryResult(conversationId, queryId);
            if (cachedResult) {
              fullQueryResults = {
                columns: cachedResult.columns,
                rows: cachedResult.rows,
              };
              console.log(
                `[generateChart] Retrieved full results from cache: ${cachedResult.rows.length} rows`,
              );
            } else {
              console.warn(
                `[generateChart] Query result not found in cache: ${queryId}, using provided queryResults`,
              );
            }
          }

          if (!fullQueryResults) {
            throw new Error('Either queryId or queryResults must be provided');
          }
          // Semantic model provides context via RAG, no need for businessContext param
          const result = await generateChart({
            chartType,
            queryResults: fullQueryResults,
            sqlQuery,
            userInput,
          });
          return result;
        },
      }),
    },
    stopWhen: stepCountIs(20),
  });

  return result.stream({
    messages: convertToModelMessages(await validateUIMessages({ messages })),
    providerOptions: {
      openai: {
        reasoningSummary: 'auto', // 'auto' for condensed or 'detailed' for comprehensive
        reasoningEffort: 'medium',
        reasoningDetailedSummary: true,
        reasoningDetailedSummaryLength: 'long',
      },
    },
  });
};

export const readDataAgentActor = fromPromise(
  async ({
    input,
  }: {
    input: {
      conversationId: string;
      previousMessages: UIMessage[];
      model: string;
      repositories?: Repositories;
      queryEngine: AbstractQueryEngine;
      promptSource?: PromptSource;
      intent?: {
        intent: string;
        complexity: string;
        needsChart: boolean;
        needsSQL: boolean;
      };
    };
  }) => {
    console.log('[readDataAgentActor] Received input:', {
      conversationId: input.conversationId,
      promptSource: input.promptSource,
      intentNeedsSQL: input.intent?.needsSQL,
      messageCount: input.previousMessages.length,
    });
    return readDataAgent(
      input.conversationId,
      input.previousMessages,
      input.model,
      input.queryEngine,
      input.repositories,
      input.promptSource,
      input.intent,
    );
  },
);
