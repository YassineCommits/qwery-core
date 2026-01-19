/**
 * RAG Integration Service
 * Orchestrates schema embedding and retrieval for the agent
 *
 * Architecture:
 * - GLOBAL RAG: Single shared knowledge base across ALL conversations
 * - All schema discoveries, query patterns, and insights are stored globally
 * - Any conversation can retrieve knowledge from all past conversations
 */

import type { SimpleSchema, SemanticModel } from '@qwery/domain/entities';
import { SchemaRAGService } from './schema-rag.service';
import { FeatureFlags } from '../feature-flags';
import type { SchemaEmbeddingDocument } from './embedding-document.type';

// GLOBAL RAG service - shared across ALL conversations
let globalRAGService: SchemaRAGService | null = null;

/**
 * Get the global RAG service (singleton)
 * All conversations share this knowledge base
 */
function getGlobalRAGService(): SchemaRAGService {
  if (!globalRAGService) {
    globalRAGService = new SchemaRAGService();
    console.log('[RAG] Initialized global RAG service');
  }
  return globalRAGService;
}

/**
 * Index schemas for a conversation after discovery
 * Only runs if USE_SCHEMA_EMBEDDING is enabled
 */
export async function indexSchemasForConversation(
  conversationId: string,
  schemas: Map<string, SimpleSchema>,
  datasourceIds: string[],
): Promise<void> {
  if (!FeatureFlags.useSchemaEmbedding) {
    return;
  }

  const globalRAG = getGlobalRAGService();

  for (const [_schemaKey, schema] of schemas) {
    const datasourceId = datasourceIds[0] ?? 'default';
    // Index to global RAG - available to ALL conversations
    await globalRAG.indexDatasource(datasourceId, schema);
  }
}

/**
 * Index semantic model for a conversation
 * Replaces indexBusinessContextForConversation with ontology-driven indexing
 * Only runs if USE_SCHEMA_EMBEDDING is enabled
 */
export async function indexSemanticModelForConversation(
  _conversationId: string,
  datasourceId: string,
  model: SemanticModel,
): Promise<void> {
  if (!FeatureFlags.useSchemaEmbedding) {
    return;
  }

  const globalRAG = getGlobalRAGService();
  let docCount = 0;

  // Define the input type for indexDocument
  type IndexDocInput = {
    id: string;
    datasourceId: string;
    type: 'table' | 'column' | 'relationship' | 'vocabulary';
    path: string;
    content: string;
    metadata: Record<string, unknown>;
  };

  // Index to global RAG - available to ALL conversations
  const indexToGlobal = async (doc: IndexDocInput) => {
    await globalRAG.indexDocument(doc);
  };

  // Index entity classes
  for (const entity of model.entityClasses.values()) {
    await indexToGlobal({
      id: `entity_${entity.id}`,
      datasourceId,
      type: 'table',
      path: entity.sourceTable,
      content: `${entity.name}: ${entity.description}. Domain: ${entity.domain}. Properties: ${entity.requiredProperties.concat(entity.optionalProperties).join(', ')}`,
      metadata: {
        tableName: entity.sourceTable,
      },
    });
    docCount++;
  }

  // Index semantic relationships
  for (const rel of model.relationships) {
    await indexToGlobal({
      id: `rel_${rel.id}`,
      datasourceId,
      type: 'relationship',
      path: `${rel.fromEntity} -> ${rel.toEntity}`,
      content: `${rel.name}: ${rel.fromEntity}.${rel.fromColumn} ${rel.type} ${rel.toEntity}.${rel.toColumn}. Join: ${rel.joinCondition}`,
      metadata: {
        relatedTables: [rel.fromEntity, rel.toEntity],
      },
    });
    docCount++;
  }

  // Index metrics
  for (const metric of model.metrics.values()) {
    await indexToGlobal({
      id: `metric_${metric.id}`,
      datasourceId,
      type: 'vocabulary',
      path: metric.name,
      content: `Metric "${metric.name}": ${metric.description}. Expression: ${metric.expression}. Aggregation: ${metric.aggregation}`,
      metadata: {},
    });
    docCount++;
  }

  // Index dimensions
  for (const dim of model.dimensions.values()) {
    const cardinality =
      dim.cardinality === 'low' || dim.cardinality === 'medium' || dim.cardinality === 'high'
        ? dim.cardinality
        : undefined;
    await indexToGlobal({
      id: `dim_${dim.id}`,
      datasourceId,
      type: 'column',
      path: dim.column,
      content: `Dimension "${dim.name}": ${dim.description}. Table: ${dim.table}, Column: ${dim.column}. Type: ${dim.dimensionType ?? 'categorical'}`,
      metadata: {
        tableName: dim.table,
        dataType: dim.dataType,
        cardinality,
      },
    });
    docCount++;
  }

  // Index synonyms/vocabulary
  for (const [term, synonyms] of model.synonyms.entries()) {
    await indexToGlobal({
      id: `synonym_${term}`,
      datasourceId,
      type: 'vocabulary',
      path: term,
      content: `"${term}" also known as: ${synonyms.join(', ')}`,
      metadata: {},
    });
    docCount++;
  }

  // Index column name variations dynamically
  // Break down column names into searchable terms (handles any language)
  for (const dim of model.dimensions.values()) {
    const colName = dim.name;
    // Extract words from column name (split on spaces, underscores, parentheses, etc.)
    const words = colName
      .split(/[\s_\-()/]+/)
      .filter((w) => w.length > 2)
      .map((w) => w.toLowerCase());

    if (words.length > 0) {
      await indexToGlobal({
        id: `col_terms_${dim.id}`,
        datasourceId,
        type: 'vocabulary',
        path: `column_terms:${colName}`,
        content: `Column "${colName}" contains terms: ${words.join(', ')}. Search for any of these words to find this column.`,
        metadata: { tableName: dim.table },
      });
      docCount++;
    }
  }

  console.log(
    `[SemanticRAG] Indexed semantic model: ${model.entityClasses.size} entities, ${model.relationships.length} relationships, ${model.metrics.size} metrics, ${model.dimensions.size} dimensions, ${model.synonyms.size} synonyms (${docCount} total docs)`,
  );
}

/**
 * Index a successful query pattern for RAG retrieval boost
 * These patterns help the agent learn from successful queries
 */
export async function indexQueryPatternForConversation(
  conversationId: string,
  userQuery: string,
  successfulSQL: string,
  entities: string[],
): Promise<void> {
  if (!FeatureFlags.useSchemaEmbedding) {
    return;
  }

  const globalRAG = getGlobalRAGService();
  const patternId = `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Index to global RAG - available to ALL conversations
  await globalRAG.indexDocument({
    id: patternId,
    datasourceId: conversationId,
    type: 'vocabulary',
    path: 'query_pattern',
    content: `User asked: "${userQuery}" → Generated SQL: ${successfulSQL}. Tables used: ${entities.join(', ')}`,
    metadata: {
      isQueryPattern: true,
      entities,
      successfulSQL,
    },
  });

  console.log(`[RAG] Indexed successful query pattern: ${patternId}`);
}

/**
 * Index a successful agent response for conversational context
 * This helps the agent understand "what we're talking about" in follow-up queries
 * Indexed to GLOBAL RAG - available to ALL conversations
 */
export async function indexAgentResponseForConversation(
  conversationId: string,
  userMessage: string,
  agentResponse: string,
  context: {
    tablesDiscussed?: string[];
    columnsDiscussed?: string[];
    queriesExecuted?: string[];
    insightsProvided?: string[];
  } = {},
): Promise<void> {
  if (!FeatureFlags.useSchemaEmbedding) {
    return;
  }

  const globalRAG = getGlobalRAGService();
  const responseId = `response_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Index to global RAG - available to ALL conversations
  await globalRAG.indexDocument({
    id: responseId,
    datasourceId: conversationId,
    type: 'vocabulary',
    path: 'conversation_context',
    content: `User asked: "${userMessage}" → Agent explained: ${agentResponse.slice(0, 500)}${agentResponse.length > 500 ? '...' : ''}`,
    metadata: {
      isConversationContext: true,
      tablesDiscussed: context.tablesDiscussed,
      columnsDiscussed: context.columnsDiscussed,
      timestamp: new Date().toISOString(),
    },
  });

  // Index specific insights if provided
  if (context.insightsProvided && context.insightsProvided.length > 0) {
    for (let i = 0; i < context.insightsProvided.length; i++) {
      const insight = context.insightsProvided[i];
      await globalRAG.indexDocument({
        id: `${responseId}_insight_${i}`,
        datasourceId: conversationId,
        type: 'vocabulary',
        path: 'agent_insight',
        content: insight ?? '',
        metadata: {
          isInsight: true,
          relatedQuery: context.queriesExecuted?.[0],
        },
      });
    }
  }

  console.log(`[RAG] Indexed agent response: ${responseId}`);
}

/**
 * Index successful schema discovery for future retrieval
 * Called when getSchema tool successfully returns schema information
 * Indexed to GLOBAL RAG - available to ALL conversations
 */
export async function indexSchemaDiscoveryForConversation(
  conversationId: string,
  tableName: string,
  columns: Array<{ name: string; type: string; description?: string }>,
  userContext: string,
): Promise<void> {
  if (!FeatureFlags.useSchemaEmbedding) {
    return;
  }

  const globalRAG = getGlobalRAGService();
  const discoveryId = `discovery_${tableName}_${Date.now()}`;

  // Index the discovery with user context
  const columnSummary = columns
    .slice(0, 10)
    .map((c) => `${c.name} (${c.type})`)
    .join(', ');

  await globalRAG.indexDocument({
    id: discoveryId,
    datasourceId: conversationId,
    type: 'table',
    path: tableName,
    content: `Table "${tableName}" was explored in context of: "${userContext}". Columns: ${columnSummary}${columns.length > 10 ? ` and ${columns.length - 10} more` : ''}`,
    metadata: {
      tableName,
      columnCount: columns.length,
    },
  });

  console.log(`[RAG] Indexed schema discovery: ${tableName}`);
}

/**
 * Index successful query result context
 * Stores what data was found, helping future queries understand available data patterns
 * Indexed to GLOBAL RAG - available to ALL conversations
 */
export async function indexQueryResultForConversation(
  conversationId: string,
  query: string,
  resultSummary: {
    rowCount: number;
    columns: string[];
    sampleValues?: Record<string, string[]>;
    aggregations?: string[];
  },
  userQuestion: string,
): Promise<void> {
  if (!FeatureFlags.useSchemaEmbedding) {
    return;
  }

  const globalRAG = getGlobalRAGService();
  const resultId = `result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Build a description of what was found
  let description = `Query for "${userQuestion}" returned ${resultSummary.rowCount} rows with columns: ${resultSummary.columns.join(', ')}.`;

  if (resultSummary.aggregations && resultSummary.aggregations.length > 0) {
    description += ` Aggregations used: ${resultSummary.aggregations.join(', ')}.`;
  }

  if (resultSummary.sampleValues) {
    const samples = Object.entries(resultSummary.sampleValues)
      .slice(0, 3)
      .map(([col, vals]) => `${col}: ${vals.slice(0, 3).join(', ')}`)
      .join('; ');
    description += ` Sample values: ${samples}`;
  }

  await globalRAG.indexDocument({
    id: resultId,
    datasourceId: conversationId,
    type: 'vocabulary',
    path: 'query_result',
    content: description,
    metadata: {
      isQueryResult: true,
      rowCount: resultSummary.rowCount,
      columns: resultSummary.columns,
      sql: query,
    },
  });

  console.log(
    `[RAG] Indexed query result: ${resultId} (${resultSummary.rowCount} rows)`,
  );
}

/**
 * Retrieve relevant schema context for a user query
 * Queries both conversation-specific and shared datasource RAG
 * Only runs if USE_RETRIEVAL is enabled
 */
export async function retrieveRelevantContext(
  _conversationId: string,
  userQuery: string,
  topK = 10,
): Promise<SchemaEmbeddingDocument[]> {
  if (!FeatureFlags.useRetrieval) {
    return [];
  }

  // Query the GLOBAL RAG - contains knowledge from ALL conversations
  const globalRAG = getGlobalRAGService();
  return globalRAG.retrieve(userQuery, topK);
}

/**
 * Build optimized schema context from RAG results
 * Only returns optimized context if USE_OPTIMIZED_PROMPT is enabled
 * Otherwise returns null (use full schema)
 */
export function buildOptimizedContext(
  retrievedDocs: SchemaEmbeddingDocument[],
): string | null {
  if (!FeatureFlags.useOptimizedPrompt || retrievedDocs.length === 0) {
    return null;
  }

  // Group documents by type
  const tables: SchemaEmbeddingDocument[] = [];
  const columns: SchemaEmbeddingDocument[] = [];
  const relationships: SchemaEmbeddingDocument[] = [];
  const vocabulary: SchemaEmbeddingDocument[] = [];

  for (const doc of retrievedDocs) {
    switch (doc.type) {
      case 'table':
        tables.push(doc);
        break;
      case 'column':
        columns.push(doc);
        break;
      case 'relationship':
        relationships.push(doc);
        break;
      case 'vocabulary':
        vocabulary.push(doc);
        break;
    }
  }

  // Build concise context string
  const parts: string[] = [];

  if (tables.length > 0) {
    parts.push('RELEVANT TABLES:');
    for (const doc of tables) {
      parts.push(`  - ${doc.path}: ${doc.content}`);
    }
  }

  if (columns.length > 0) {
    parts.push('\nRELEVANT COLUMNS:');
    for (const doc of columns) {
      parts.push(`  - ${doc.path} (${doc.metadata.dataType ?? 'unknown'})`);
    }
  }

  if (relationships.length > 0) {
    parts.push('\nJOIN RELATIONSHIPS:');
    for (const doc of relationships) {
      parts.push(`  - ${doc.content}`);
    }
  }

  if (vocabulary.length > 0) {
    parts.push('\nBUSINESS TERMS:');
    for (const doc of vocabulary) {
      parts.push(`  - ${doc.content}`);
    }
  }

  return parts.join('\n');
}

/**
 * Invalidate RAG cache for a datasource in the global RAG
 */
export async function invalidateDatasourceRAG(
  _conversationId: string,
  datasourceId: string,
): Promise<void> {
  const globalRAG = getGlobalRAGService();
  await globalRAG.invalidate(datasourceId);
}

/**
 * Clear RAG service (no-op for global RAG - we don't clear global knowledge)
 * Kept for backward compatibility
 */
export function clearConversationRAG(_conversationId: string): void {
  // No-op: Global RAG persists knowledge across all conversations
  // Only clear in exceptional circumstances (e.g., testing)
}

/**
 * Get feature flag status for logging
 */
export function getRAGStatus(): {
  schemaEmbedding: boolean;
  retrieval: boolean;
  optimizedPrompt: boolean;
  crag: boolean;
} {
  return FeatureFlags.getStatus();
}
