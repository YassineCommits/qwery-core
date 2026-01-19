export type {
  SchemaEmbeddingDocument,
  EmbeddingDocumentType,
  EmbeddingMetadata,
} from './embedding-document.type';

export {
  createTableDocument,
  createColumnDocument,
  createRelationshipDocument,
  createVocabularyDocument,
} from './embedding-document.type';

export type {
  VectorStoreAdapter,
  VectorSearchResult,
} from './vector-store.adapter';
export { InMemoryVectorStore } from './vector-store.adapter';

export type { EmbeddingProvider } from './embedding-provider';
export {
  AzureEmbeddingProvider,
  LocalTFIDFProvider,
  createEmbeddingProvider,
  getDefaultEmbeddingProvider,
  defaultEmbeddingProvider,
} from './embedding-provider';

export { SchemaRAGService, schemaRAGService } from './schema-rag.service';
export {
  indexSchemasForConversation,
  indexSemanticModelForConversation,
  indexQueryPatternForConversation,
  indexAgentResponseForConversation,
  indexSchemaDiscoveryForConversation,
  indexQueryResultForConversation,
  retrieveRelevantContext,
  buildOptimizedContext,
  invalidateDatasourceRAG,
  clearConversationRAG,
  getRAGStatus,
} from './rag-integration.service';
