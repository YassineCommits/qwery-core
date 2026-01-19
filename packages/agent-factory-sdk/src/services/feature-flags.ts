/**
 * Feature Flags for RAG/Semantic Layer Integration
 * Reads from environment variables (supports both Node and Vite)
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

function isEnabled(key: string): boolean {
  const value = getEnv(key);
  return value === 'true' || value === '1';
}

/**
 * Feature flags for progressive RAG rollout
 */
export const FeatureFlags = {
  /**
   * Phase 1: Enable schema embedding
   * When enabled, schemas are automatically embedded after discovery
   */
  get useSchemaEmbedding(): boolean {
    return isEnabled('USE_SCHEMA_EMBEDDING');
  },

  /**
   * Phase 2: Enable retrieval layer
   * When enabled, semantic search retrieves relevant context before LLM calls
   */
  get useRetrieval(): boolean {
    return isEnabled('USE_RETRIEVAL');
  },

  /**
   * Phase 3: Enable optimized prompts
   * When enabled, prompts use retrieved context instead of full schemas
   * Reduces token usage by 60-70%
   */
  get useOptimizedPrompt(): boolean {
    return isEnabled('USE_OPTIMIZED_PROMPT');
  },

  /**
   * Phase 4: Enable CRAG (Corrective RAG)
   * When enabled, query errors trigger corrective retrieval with suggestions
   */
  get useCRAG(): boolean {
    return isEnabled('USE_CRAG');
  },

  /**
   * Check current feature flag status
   */
  getStatus(): {
    schemaEmbedding: boolean;
    retrieval: boolean;
    optimizedPrompt: boolean;
    crag: boolean;
  } {
    return {
      schemaEmbedding: this.useSchemaEmbedding,
      retrieval: this.useRetrieval,
      optimizedPrompt: this.useOptimizedPrompt,
      crag: this.useCRAG,
    };
  },
};
