import { embed, embedMany, type EmbeddingModel } from 'ai';
import { createAzure } from '@ai-sdk/azure';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
  readonly modelName: string;
}

/**
 * Get environment variable (works in both Node and browser/Vite)
 */
function getEnv(key: string): string | undefined {
  let value: string | undefined;

  if (typeof process !== 'undefined' && process.env) {
    value = process.env[key];
  }
  if (!value && typeof import.meta !== 'undefined' && import.meta.env) {
    value = import.meta.env[key];
  }

  return value && value.trim() !== '' ? value : undefined;
}

/**
 * Azure Embedding Provider
 * Uses Azure OpenAI embeddings via the existing model abstraction
 */
export class AzureEmbeddingProvider implements EmbeddingProvider {
  private embeddingModel: EmbeddingModel<string>;
  readonly dimensions: number;
  readonly modelName: string;

  constructor(options?: {
    resourceName?: string;
    apiKey?: string;
    deployment?: string;
  }) {
    const resourceName = options?.resourceName ?? getEnv('AZURE_RESOURCE_NAME');
    const apiKey = options?.apiKey ?? getEnv('AZURE_API_KEY');
    const deployment =
      options?.deployment ??
      getEnv('AZURE_EMBEDDING_DEPLOYMENT') ??
      'text-embedding-3-small';

    if (!resourceName || !apiKey) {
      throw new Error(
        'Azure embedding provider requires AZURE_RESOURCE_NAME and AZURE_API_KEY',
      );
    }

    const azure = createAzure({
      resourceName,
      apiKey,
    });

    this.embeddingModel = azure.embedding(deployment);
    this.modelName = `azure/${deployment}`;
    this.dimensions = deployment.includes('large') ? 3072 : 1536;
  }

  async embed(text: string): Promise<number[]> {
    const result = await embed({
      model: this.embeddingModel,
      value: text,
    });
    return result.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const result = await embedMany({
      model: this.embeddingModel,
      values: texts,
    });
    return result.embeddings;
  }
}

/**
 * Local TF-IDF Embedding Provider (no API needed)
 * Uses vocabulary-based embeddings with n-grams
 * Good for development and when embedding APIs are not available
 */
export class LocalTFIDFProvider implements EmbeddingProvider {
  readonly dimensions = 384;
  readonly modelName = 'local-tfidf';

  private vocabulary: string[];
  private idfWeights: Map<string, number>;

  constructor() {
    this.vocabulary = this.buildVocabulary();
    this.idfWeights = new Map();
    this.vocabulary.forEach((term) => this.idfWeights.set(term, 1.0));
  }

  async embed(text: string): Promise<number[]> {
    return this.computeEmbedding(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.computeEmbedding(text));
  }

  private computeEmbedding(text: string): number[] {
    const tokens = this.tokenize(text);
    const embedding = new Array(this.dimensions).fill(0);

    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    for (const [term, freq] of tf) {
      const index = this.vocabulary.indexOf(term);
      if (index >= 0 && index < this.dimensions) {
        const idf = this.idfWeights.get(term) || 1.0;
        embedding[index] = freq * idf;
      }
    }

    // Add bigram features
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      const bigramIndex = this.hashBigram(bigram);
      embedding[bigramIndex] += 0.5;
    }

    // L2 normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private hashBigram(bigram: string): number {
    let hash = 0;
    for (let i = 0; i < bigram.length; i++) {
      hash = (hash * 31 + bigram.charCodeAt(i)) % this.dimensions;
    }
    return hash;
  }

  private buildVocabulary(): string[] {
    return [
      // Schema terms
      'table',
      'column',
      'database',
      'schema',
      'index',
      'view',
      'constraint',
      'primary',
      'foreign',
      'key',
      'unique',
      'nullable',
      'default',
      // Data types
      'integer',
      'varchar',
      'text',
      'boolean',
      'date',
      'timestamp',
      'decimal',
      'float',
      'double',
      'bigint',
      'smallint',
      'uuid',
      'json',
      'array',
      // Entity terms
      'id',
      'name',
      'title',
      'description',
      'status',
      'type',
      'code',
      'customer',
      'customers',
      'order',
      'orders',
      'product',
      'products',
      'user',
      'users',
      'item',
      'items',
      'payment',
      'payments',
      'employee',
      'employees',
      'ticket',
      'tickets',
      'purchase',
      'purchases',
      'invoice',
      'invoices',
      'transaction',
      'transactions',
      'account',
      'accounts',
      // Metric terms
      'amount',
      'total',
      'count',
      'sum',
      'average',
      'avg',
      'min',
      'max',
      'price',
      'cost',
      'revenue',
      'sales',
      'quantity',
      'balance',
      'rate',
      // Dimension terms
      'category',
      'segment',
      'region',
      'country',
      'state',
      'city',
      'zip',
      'year',
      'month',
      'day',
      'week',
      'quarter',
      'hour',
      'minute',
      // Contact terms
      'email',
      'phone',
      'address',
      'contact',
      'first',
      'last',
      'full',
      // Status terms
      'active',
      'inactive',
      'pending',
      'completed',
      'cancelled',
      'shipped',
      'delivered',
      'processing',
      'failed',
      'success',
      'error',
      'approved',
      // Relationship terms
      'join',
      'relationship',
      'reference',
      'link',
      'parent',
      'child',
      'one',
      'many',
      'belongs',
      'has',
      'contains',
      'related',
      // Query terms
      'select',
      'from',
      'where',
      'group',
      'by',
      'having',
      'order',
      'limit',
      'asc',
      'desc',
      'and',
      'or',
      'not',
      'in',
      'between',
      'like',
      'null',
      // Action terms
      'show',
      'display',
      'list',
      'get',
      'find',
      'fetch',
      'query',
      'search',
      'filter',
      'sort',
      'aggregate',
      'calculate',
      'compute',
      'analyze',
      // Time terms
      'created',
      'updated',
      'deleted',
      'modified',
      'at',
      'on',
      'since',
      'until',
      // Common modifiers
      'all',
      'each',
      'every',
      'any',
      'some',
      'most',
      'top',
      'bottom',
      'next',
      'previous',
      'latest',
      'oldest',
      'recent',
      // Analytics terms
      'trend',
      'growth',
      'decline',
      'comparison',
      'breakdown',
      'distribution',
      'percentage',
      'ratio',
      'metric',
      'dimension',
      'measure',
      'kpi',
      // Chart terms
      'chart',
      'graph',
      'plot',
      'bar',
      'line',
      'pie',
      'scatter',
      'histogram',
      // SQL terms
      'left',
      'right',
      'inner',
      'outer',
      'cross',
      'natural',
      'using',
      'insert',
      'update',
      'delete',
      'create',
      'drop',
      'alter',
      'truncate',
    ].slice(0, this.dimensions);
  }
}

/**
 * Factory for creating embedding providers
 * Respects the existing model abstraction pattern
 */
export function createEmbeddingProvider(
  type: 'azure' | 'local' = 'local',
  options?: {
    resourceName?: string;
    apiKey?: string;
    deployment?: string;
  },
): EmbeddingProvider {
  switch (type) {
    case 'azure':
      return new AzureEmbeddingProvider(options);
    case 'local':
    default:
      return new LocalTFIDFProvider();
  }
}

/**
 * Get default embedding provider based on environment
 * Uses local by default for browser compatibility
 * Call createEmbeddingProvider('azure') explicitly in server context
 */
export function getDefaultEmbeddingProvider(): EmbeddingProvider {
  return new LocalTFIDFProvider();
}

// Export a lazy-initialized default for convenience
// Always uses local to avoid browser issues
export const defaultEmbeddingProvider: EmbeddingProvider =
  new LocalTFIDFProvider();
