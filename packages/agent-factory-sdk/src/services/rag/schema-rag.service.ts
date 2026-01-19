import type { SimpleSchema } from '@qwery/domain/entities';
import {
  type SchemaEmbeddingDocument,
  createTableDocument,
  createColumnDocument,
} from './embedding-document.type';
import {
  type VectorStoreAdapter,
  InMemoryVectorStore,
} from './vector-store.adapter';
import {
  type EmbeddingProvider,
  defaultEmbeddingProvider,
} from './embedding-provider';

/**
 * Schema RAG Service
 * Indexes schema metadata and business context for semantic retrieval
 */
export class SchemaRAGService {
  private vectorStore: VectorStoreAdapter;
  private embeddingProvider: EmbeddingProvider;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(
    vectorStore?: VectorStoreAdapter,
    embeddingProvider?: EmbeddingProvider,
  ) {
    this.vectorStore = vectorStore ?? new InMemoryVectorStore();
    this.embeddingProvider = embeddingProvider ?? defaultEmbeddingProvider;
  }

  /**
   * Index a datasource schema for retrieval
   */
  async indexDatasource(
    datasourceId: string,
    schema: SimpleSchema,
  ): Promise<void> {
    const documents: SchemaEmbeddingDocument[] = [];

    for (const table of schema.tables) {
      const tablePath = `${schema.databaseName}.${schema.schemaName}.${table.tableName}`;
      const columnNames = table.columns.map((c) => c.columnName);

      // Create table document
      documents.push(
        createTableDocument({
          datasourceId,
          path: tablePath,
          tableName: table.tableName,
          columns: columnNames,
        }),
      );

      // Create column documents
      for (const column of table.columns) {
        const columnPath = `${tablePath}.${column.columnName}`;
        const isForeignKey =
          column.columnName.endsWith('_id') && column.columnName !== 'id';

        documents.push(
          createColumnDocument({
            datasourceId,
            path: columnPath,
            columnName: column.columnName,
            tableName: table.tableName,
            dataType: column.columnType,
            isForeignKey,
          }),
        );
      }
    }

    // Generate embeddings for all documents
    await this.generateEmbeddings(documents);

    // Store in vector store
    await this.vectorStore.upsert(documents);

    console.log(
      `[SchemaRAG] Indexed ${documents.length} documents for datasource ${datasourceId}`,
    );
  }

  /**
   * Retrieve relevant schema context for a query
   * @param query - The search query
   * @param topK - Number of results to return
   * @param minScore - Minimum similarity score threshold (default: 0.1 for local, 0.5 for OpenAI)
   */
  async retrieve(
    query: string,
    topK = 10,
    minScore?: number,
  ): Promise<SchemaEmbeddingDocument[]> {
    // Generate embedding for query
    const queryEmbedding = await this.generateQueryEmbedding(query);

    if (!queryEmbedding || queryEmbedding.length === 0) {
      console.warn(
        '[SchemaRAG] Could not generate query embedding, falling back to empty results',
      );
      return [];
    }

    // Search vector store
    const results = await this.vectorStore.search(queryEmbedding, topK);

    // Use adaptive threshold based on provider
    const threshold =
      minScore ??
      (this.embeddingProvider.modelName === 'local-tfidf' ? 0.1 : 0.5);

    // Filter by minimum score threshold
    const filtered = results.filter((r) => r.score > threshold);

    console.log(
      `[SchemaRAG] Retrieved ${filtered.length} documents for query "${query.substring(0, 50)}..."`,
    );

    return filtered.map((r) => r.document);
  }

  /**
   * Index a single document (for semantic model integration)
   */
  async indexDocument(doc: {
    id: string;
    datasourceId: string;
    type: SchemaEmbeddingDocument['type'];
    path: string;
    content: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const document: SchemaEmbeddingDocument = {
      datasourceId: doc.datasourceId,
      type: doc.type,
      path: doc.path,
      content: doc.content,
      metadata: doc.metadata as SchemaEmbeddingDocument['metadata'],
      updatedAt: new Date(),
    };

    await this.generateEmbeddings([document]);
    await this.vectorStore.upsert([document]);
  }

  /**
   * Invalidate all documents for a datasource
   */
  async invalidate(datasourceId: string): Promise<void> {
    await this.vectorStore.deleteByDatasource(datasourceId);
    console.log(
      `[SchemaRAG] Invalidated documents for datasource ${datasourceId}`,
    );
  }

  /**
   * Generate embeddings for documents using the configured provider
   */
  private async generateEmbeddings(
    documents: SchemaEmbeddingDocument[],
  ): Promise<void> {
    const texts = documents.map((doc) => doc.content);

    // Batch embed for efficiency
    const embeddings = await this.embeddingProvider.embedBatch(texts);

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const embedding = embeddings[i];
      if (doc && embedding) {
        doc.embedding = embedding;
      }
    }
  }

  /**
   * Generate embedding for a query string
   */
  private async generateQueryEmbedding(query: string): Promise<number[]> {
    // Check cache
    const cached = this.embeddingCache.get(query);
    if (cached) {
      return cached;
    }

    const embedding = await this.embeddingProvider.embed(query);

    // Cache the embedding
    this.embeddingCache.set(query, embedding);

    // Limit cache size
    if (this.embeddingCache.size > 1000) {
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) {
        this.embeddingCache.delete(firstKey);
      }
    }

    return embedding;
  }

  /**
   * Get the embedding provider info for debugging
   */
  getProviderInfo(): { modelName: string; dimensions: number } {
    return {
      modelName: this.embeddingProvider.modelName,
      dimensions: this.embeddingProvider.dimensions,
    };
  }
}

export const schemaRAGService = new SchemaRAGService();
