/**
 * Query Result Cache
 * Stores full query results in memory to avoid injecting them into agent context
 * Tools can access full results via query ID
 *
 * Features:
 * - TTL-based expiration (configurable)
 * - Cache lookup before execution
 * - Invalidation on schema change
 */

export interface QueryResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  query: string;
  normalizedQuery: string;
  timestamp: number;
  ttlMs: number;
  schemaVersion?: string;
}

export interface CacheConfig {
  defaultTTLMs: number;
  maxEntriesPerConversation: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  defaultTTLMs: 5 * 60 * 1000, // 5 minutes
  maxEntriesPerConversation: 100,
};

let cacheConfig = { ...DEFAULT_CONFIG };

/**
 * Per-conversation query result cache
 * conversationId -> normalizedQuery -> QueryResult
 */
const queryResultCache = new Map<string, Map<string, QueryResult>>();

/**
 * Schema version tracking for invalidation
 * datasourceId -> version
 */
const schemaVersions = new Map<string, string>();

/**
 * Normalize query for cache key (remove whitespace variations)
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
}

/**
 * Generate a unique query ID from the query string
 */
function generateQueryId(query: string): string {
  const normalized = normalizeQuery(query);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `query_${Math.abs(hash).toString(36)}`;
}

/**
 * Get or create cache for a conversation
 */
function getCache(conversationId: string): Map<string, QueryResult> {
  if (!queryResultCache.has(conversationId)) {
    queryResultCache.set(conversationId, new Map());
  }
  return queryResultCache.get(conversationId)!;
}

/**
 * Store query result in cache
 */
export function storeQueryResult(
  conversationId: string,
  query: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  options?: { ttlMs?: number; schemaVersion?: string },
): string {
  const cache = getCache(conversationId);
  const queryId = generateQueryId(query);
  const normalizedQuery = normalizeQuery(query);

  // Enforce max entries limit
  if (cache.size >= cacheConfig.maxEntriesPerConversation) {
    // Remove oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, value] of cache.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  cache.set(queryId, {
    columns,
    rows,
    query,
    normalizedQuery,
    timestamp: Date.now(),
    ttlMs: options?.ttlMs ?? cacheConfig.defaultTTLMs,
    schemaVersion: options?.schemaVersion,
  });

  return queryId;
}

/**
 * Check if a cached result exists and is still valid
 */
export function getCachedResult(
  conversationId: string,
  query: string,
  currentSchemaVersion?: string,
): QueryResult | null {
  const cache = getCache(conversationId);
  const normalizedQuery = normalizeQuery(query);

  // Look for matching query
  for (const [_key, result] of cache.entries()) {
    if (result.normalizedQuery === normalizedQuery) {
      // Check TTL
      const age = Date.now() - result.timestamp;
      if (age > result.ttlMs) {
        return null;
      }

      // Check schema version if provided
      if (
        currentSchemaVersion &&
        result.schemaVersion &&
        result.schemaVersion !== currentSchemaVersion
      ) {
        return null;
      }

      return result;
    }
  }

  return null;
}

/**
 * Update schema version (triggers invalidation of cached results)
 */
export function updateSchemaVersion(datasourceId: string): string {
  const version = `v${Date.now()}`;
  schemaVersions.set(datasourceId, version);
  return version;
}

/**
 * Get current schema version
 */
export function getSchemaVersion(datasourceId: string): string | undefined {
  return schemaVersions.get(datasourceId);
}

/**
 * Invalidate all cached results for a datasource
 */
export function invalidateDatasourceCache(datasourceId: string): void {
  const version = updateSchemaVersion(datasourceId);

  // Mark all existing cache entries as invalid by bumping schema version
  for (const [_convId, cache] of queryResultCache.entries()) {
    for (const [key, result] of cache.entries()) {
      // If result references this datasource's schema, remove it
      if (result.schemaVersion && result.schemaVersion !== version) {
        cache.delete(key);
      }
    }
  }
}

/**
 * Configure cache settings
 */
export function configureCacheSettings(config: Partial<CacheConfig>): void {
  cacheConfig = { ...cacheConfig, ...config };
}

/**
 * Get full query result from cache
 */
export function getQueryResult(
  conversationId: string,
  queryId: string,
): QueryResult | null {
  const cache = getCache(conversationId);
  const result = cache.get(queryId);
  return result || null;
}

/**
 * Clear cache for a conversation
 */
export function clearQueryResultCache(conversationId: string): void {
  queryResultCache.delete(conversationId);
}

/**
 * Cleanup old entries (older than 1 hour)
 */
export function cleanupOldResults(conversationId: string): void {
  const cache = getCache(conversationId);
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  for (const [queryId, result] of cache.entries()) {
    if (result.timestamp < oneHourAgo) {
      cache.delete(queryId);
    }
  }
}
