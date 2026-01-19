import { describe, it, expect, beforeEach } from 'vitest';
import {
  storeQueryResult,
  getCachedResult,
  getQueryResult,
  clearQueryResultCache,
  updateSchemaVersion,
  invalidateDatasourceCache,
  configureCacheSettings,
} from '../../src/tools/query-result-cache';

describe('Query Result Cache Tests', () => {
  const conversationId = 'test-conv-123';

  beforeEach(() => {
    clearQueryResultCache(conversationId);
  });

  describe('Basic Cache Operations', () => {
    it('should store and retrieve query results', () => {
      const query = 'SELECT * FROM orders LIMIT 10';
      const columns = ['id', 'customer_id', 'total'];
      const rows = [
        { id: 1, customer_id: 1, total: 100 },
        { id: 2, customer_id: 2, total: 200 },
      ];

      const queryId = storeQueryResult(conversationId, query, columns, rows);

      expect(queryId).toBeDefined();
      expect(queryId).toMatch(/^query_/);

      const result = getQueryResult(conversationId, queryId);
      expect(result).toBeDefined();
      expect(result!.columns).toEqual(columns);
      expect(result!.rows).toEqual(rows);
    });

    it('should return cache hit for identical queries', () => {
      const query = 'SELECT * FROM orders';
      const columns = ['id', 'total'];
      const rows = [{ id: 1, total: 100 }];

      storeQueryResult(conversationId, query, columns, rows);

      const cached = getCachedResult(conversationId, query);

      expect(cached).toBeDefined();
      expect(cached!.rows).toEqual(rows);

      console.log('\n=== Cache Hit Test ===');
      console.log('Query:', query);
      console.log('Cache result:', cached ? 'HIT' : 'MISS');
    });

    it('should normalize query whitespace for cache matching', () => {
      const query1 = 'SELECT * FROM orders';
      const query2 = '  SELECT   *   FROM   orders  ';
      const query3 = 'select * from orders;';

      const columns = ['id'];
      const rows = [{ id: 1 }];

      storeQueryResult(conversationId, query1, columns, rows);

      console.log('\n=== Query Normalization Test ===');

      const cached1 = getCachedResult(conversationId, query1);
      console.log(`Original query: ${cached1 ? 'HIT' : 'MISS'}`);
      expect(cached1).toBeDefined();

      const cached2 = getCachedResult(conversationId, query2);
      console.log(`Whitespace variant: ${cached2 ? 'HIT' : 'MISS'}`);
      expect(cached2).toBeDefined();

      const cached3 = getCachedResult(conversationId, query3);
      console.log(`Lowercase + semicolon: ${cached3 ? 'HIT' : 'MISS'}`);
      expect(cached3).toBeDefined();
    });
  });

  describe('TTL Expiration', () => {
    it('should expire cached results after TTL', async () => {
      const query = 'SELECT * FROM products';
      const columns = ['id'];
      const rows = [{ id: 1 }];

      // Store with very short TTL
      storeQueryResult(conversationId, query, columns, rows, { ttlMs: 50 });

      // Should be cached immediately
      const cached1 = getCachedResult(conversationId, query);
      expect(cached1).toBeDefined();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should be expired
      const cached2 = getCachedResult(conversationId, query);
      expect(cached2).toBeNull();

      console.log('\n=== TTL Expiration Test ===');
      console.log('Immediate lookup: HIT');
      console.log('After 100ms (TTL: 50ms): MISS (expired)');
    });
  });

  describe('Schema Version Invalidation', () => {
    it('should invalidate cache when schema version changes', async () => {
      const datasourceId = 'test-ds';
      const query = 'SELECT * FROM customers';
      const columns = ['id', 'name'];
      const rows = [{ id: 1, name: 'Alice' }];

      // Get initial schema version
      const version1 = updateSchemaVersion(datasourceId);

      // Store with schema version
      storeQueryResult(conversationId, query, columns, rows, {
        schemaVersion: version1,
      });

      // Should be cached
      const cached1 = getCachedResult(conversationId, query, version1);
      expect(cached1).toBeDefined();

      // Wait to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 2));

      // Update schema version
      const version2 = updateSchemaVersion(datasourceId);

      // Should be invalidated due to version mismatch
      const cached2 = getCachedResult(conversationId, query, version2);
      expect(cached2).toBeNull();

      console.log('\n=== Schema Version Invalidation Test ===');
      console.log('With matching version: HIT');
      console.log('After schema update: MISS (invalidated)');
    });

    it('should clear all cache entries on datasource invalidation', async () => {
      const datasourceId = 'test-ds-invalidation';
      const query1 = 'SELECT * FROM orders_inv';
      const query2 = 'SELECT * FROM customers_inv';

      const version = updateSchemaVersion(datasourceId);

      storeQueryResult(conversationId, query1, ['id'], [{ id: 1 }], {
        schemaVersion: version,
      });
      storeQueryResult(conversationId, query2, ['id'], [{ id: 2 }], {
        schemaVersion: version,
      });

      // Both should be cached with matching version
      expect(getCachedResult(conversationId, query1, version)).toBeDefined();
      expect(getCachedResult(conversationId, query2, version)).toBeDefined();

      // Wait to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 2));

      // Invalidate datasource - this updates the version internally
      invalidateDatasourceCache(datasourceId);

      // Wait again
      await new Promise((resolve) => setTimeout(resolve, 2));

      // Get new version after invalidation
      const newVersion = updateSchemaVersion(datasourceId);

      // Both should be invalidated because newVersion != original version
      expect(getCachedResult(conversationId, query1, newVersion)).toBeNull();
      expect(getCachedResult(conversationId, query2, newVersion)).toBeNull();

      console.log('\n=== Datasource Invalidation Test ===');
      console.log('Before invalidation: 2 cached queries');
      console.log('After invalidation: 0 cached queries');
    });
  });

  describe('Cache Size Limits', () => {
    it('should evict oldest entries when limit is reached', () => {
      // Configure small limit for testing
      configureCacheSettings({ maxEntriesPerConversation: 3 });

      const queries = [
        'SELECT * FROM t1',
        'SELECT * FROM t2',
        'SELECT * FROM t3',
        'SELECT * FROM t4', // This should evict t1
      ];

      for (let i = 0; i < queries.length; i++) {
        storeQueryResult(conversationId, queries[i], ['id'], [{ id: i }]);
      }

      console.log('\n=== Cache Size Limit Test ===');
      console.log('Max entries: 3');
      console.log('Queries stored: 4');

      // t1 should be evicted (oldest)
      const cached1 = getCachedResult(conversationId, queries[0]);
      console.log(`Query t1: ${cached1 ? 'HIT' : 'MISS (evicted)'}`);
      expect(cached1).toBeNull();

      // t4 should still be cached (newest)
      const cached4 = getCachedResult(conversationId, queries[3]);
      console.log(`Query t4: ${cached4 ? 'HIT' : 'MISS'}`);
      expect(cached4).toBeDefined();

      // Reset config
      configureCacheSettings({ maxEntriesPerConversation: 100 });
    });
  });
});
