import type { SchemaEmbeddingDocument } from './embedding-document.type';

/**
 * Vector store search result
 */
export interface VectorSearchResult {
  document: SchemaEmbeddingDocument;
  score: number;
}

/**
 * Abstract vector store adapter interface
 * Allows swapping between different vector store implementations
 */
export interface VectorStoreAdapter {
  /** Store documents with their embeddings */
  upsert(documents: SchemaEmbeddingDocument[]): Promise<void>;

  /** Search for similar documents */
  search(embedding: number[], topK: number): Promise<VectorSearchResult[]>;

  /** Delete documents by datasource ID */
  deleteByDatasource(datasourceId: string): Promise<void>;

  /** Clear all documents */
  clear(): Promise<void>;
}

/**
 * In-memory vector store implementation
 * Uses simple cosine similarity for searching
 * Good for development and small datasets
 */
export class InMemoryVectorStore implements VectorStoreAdapter {
  private documents: Map<string, SchemaEmbeddingDocument> = new Map();

  async upsert(documents: SchemaEmbeddingDocument[]): Promise<void> {
    for (const doc of documents) {
      this.documents.set(doc.path, doc);
    }
  }

  async search(
    embedding: number[],
    topK: number,
  ): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const document of this.documents.values()) {
      if (!document.embedding || document.embedding.length === 0) {
        continue;
      }

      const score = this.cosineSimilarity(embedding, document.embedding);
      results.push({ document, score });
    }

    // Sort by score descending and take top K
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async deleteByDatasource(datasourceId: string): Promise<void> {
    for (const [path, doc] of this.documents.entries()) {
      if (doc.datasourceId === datasourceId) {
        this.documents.delete(path);
      }
    }
  }

  async clear(): Promise<void> {
    this.documents.clear();
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
