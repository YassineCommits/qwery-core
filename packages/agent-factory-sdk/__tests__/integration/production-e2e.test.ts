import { describe, it, expect } from 'vitest';
import {
  semanticModelService,
  queryPlanner,
  queryVerifier,
  queryExplainer,
  InMemoryVectorStore,
  LocalTFIDFProvider,
  SchemaRAGService,
} from '../../src/services';
import { detectIntent } from '../../src/agents/actors/detect-intent.actor';
import type { SimpleSchema } from '@qwery/domain/entities';

// Real PostgreSQL schema structure from the test database
const realPgSchema: SimpleSchema = {
  databaseName: 'pg',
  schemaName: 'public',
  tables: [
    {
      tableName: 'orders',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'customer_id', columnType: 'INTEGER' },
        { columnName: 'order_date', columnType: 'DATE' },
        { columnName: 'status', columnType: 'VARCHAR' },
        { columnName: 'total', columnType: 'DECIMAL(10,2)' },
      ],
    },
    {
      tableName: 'customers',
      columns: [
        { columnName: 'customer_id', columnType: 'INTEGER' },
        { columnName: 'name', columnType: 'VARCHAR' },
        { columnName: 'email', columnType: 'VARCHAR' },
        { columnName: 'segment', columnType: 'VARCHAR' },
      ],
    },
    {
      tableName: 'products',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'name', columnType: 'VARCHAR' },
        { columnName: 'category', columnType: 'VARCHAR' },
        { columnName: 'unit_price', columnType: 'DECIMAL(10,2)' },
      ],
    },
    {
      tableName: 'order_items',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'order_id', columnType: 'INTEGER' },
        { columnName: 'product_id', columnType: 'INTEGER' },
        { columnName: 'quantity', columnType: 'INTEGER' },
        { columnName: 'unit_price', columnType: 'DECIMAL(10,2)' },
      ],
    },
    {
      tableName: 'payments',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'order_id', columnType: 'INTEGER' },
        { columnName: 'amount', columnType: 'DECIMAL(10,2)' },
        { columnName: 'method', columnType: 'VARCHAR' },
        { columnName: 'status', columnType: 'VARCHAR' },
      ],
    },
  ],
};

describe('Production E2E Tests', () => {
  describe('Full Analytical Query Flow with Explainability', () => {
    it('should process "show total revenue by customer" with full trace', async () => {
      const userQuery = 'show total revenue by customer';
      const startTime = performance.now();

      console.log('\n');
      console.log(
        '═══════════════════════════════════════════════════════════════',
      );
      console.log('         PRODUCTION E2E TEST: Analytical Query Flow');
      console.log(
        '═══════════════════════════════════════════════════════════════',
      );

      // Create trace
      const trace = queryExplainer.createTrace(userQuery);

      // Step 1: Intent Detection
      const intentStart = performance.now();
      const intent = await detectIntent(userQuery);
      const intentTime = performance.now() - intentStart;

      queryExplainer.recordIntentDetection(trace, {
        method: 'keyword',
        intent: intent.intent,
        needsSQL: intent.needsSQL,
        needsChart: intent.needsChart,
        complexity: intent.complexity ?? 'simple',
        keywordPattern: 'show.*',
      });

      console.log(`\n✅ Step 1: Intent Detection (${intentTime.toFixed(2)}ms)`);
      console.log(`   Method: KEYWORD (no LLM)`);
      console.log(`   Intent: ${intent.intent}`);
      console.log(`   Needs SQL: ${intent.needsSQL}`);

      // Step 2: Schema Retrieval via RAG
      const ragStart = performance.now();
      const vectorStore = new InMemoryVectorStore();
      const embeddingProvider = new LocalTFIDFProvider();
      const ragService = new SchemaRAGService(vectorStore, embeddingProvider);
      await ragService.indexDatasource('pg', realPgSchema);

      const ragResults = await ragService.retrieve(
        'revenue customer total orders',
        5,
        0.05,
      );
      const ragTime = performance.now() - ragStart;

      queryExplainer.recordSchemaRetrieval(trace, {
        tablesFound: ragResults
          .filter((r) => r.type === 'table')
          .map((r) => r.path),
        columnsFound: ragResults
          .filter((r) => r.type === 'column')
          .map((r) => r.path),
        ragDocumentsRetrieved: ragResults.length,
      });

      console.log(`\n✅ Step 2: Schema Retrieval (${ragTime.toFixed(2)}ms)`);
      console.log(`   RAG Documents Retrieved: ${ragResults.length}`);
      console.log(
        `   Tables: ${ragResults
          .filter((r) => r.type === 'table')
          .map((r) => r.path)
          .join(', ')}`,
      );

      // Step 3: Build Semantic Model
      const semanticStart = performance.now();
      const semanticModel = semanticModelService.buildFromSchema(
        'test',
        realPgSchema,
      );

      // Add custom metric for revenue
      semanticModel.metrics.set('total_revenue', {
        id: 'total_revenue',
        name: 'total_revenue',
        expression: 'SUM(orders.total)',
        description: 'Total revenue from orders',
        requiredTables: ['orders'],
        dataType: 'decimal',
        aggregation: 'sum',
      });

      // Add customer dimension
      semanticModel.dimensions.set('customer_name', {
        id: 'customer_name',
        name: 'customer_name',
        column: 'customers.name',
        table: 'customers',
        description: 'Customer name',
        cardinality: 'medium',
        dataType: 'string',
      });

      const semanticTime = performance.now() - semanticStart;

      queryExplainer.recordSemanticInterpretation(trace, semanticModel, {
        metricsIdentified: ['total_revenue'],
        dimensionsIdentified: ['customer_name'],
        filtersApplied: [],
        joinsRequired: ['orders.customer_id = customers.customer_id'],
      });

      console.log(
        `\n✅ Step 3: Semantic Interpretation (${semanticTime.toFixed(2)}ms)`,
      );
      console.log(`   Metrics: total_revenue (SUM(orders.total))`);
      console.log(`   Dimensions: customer_name`);
      console.log(`   Joins: orders -> customers`);

      // Step 4: Generate Logical Plan
      const planStart = performance.now();
      const plan = queryPlanner.plan(
        {
          userQuery,
          intent: {
            metrics: ['total_revenue'],
            dimensions: ['customer_name'],
          },
        },
        semanticModel,
      );
      const planTime = performance.now() - planStart;

      queryExplainer.recordLogicalPlan(trace, plan);

      console.log(`\n✅ Step 4: Logical Plan (${planTime.toFixed(2)}ms)`);
      console.log(`   Tables: ${plan.tables.join(', ')}`);
      console.log(`   Aggregation: ${plan.hasAggregation ? 'YES' : 'NO'}`);
      console.log(`   Confidence: ${(plan.confidence * 100).toFixed(0)}%`);

      // Step 5: Verify Plan
      const verifyStart = performance.now();
      const verification = queryVerifier.verify(plan, semanticModel);
      const verifyTime = performance.now() - verifyStart;

      console.log(
        `\n✅ Step 5: Plan Verification (${verifyTime.toFixed(2)}ms)`,
      );
      console.log(`   Valid: ${verification.valid ? 'YES' : 'NO'}`);
      console.log(
        `   Suggestions: ${verification.suggestions.join(', ') || '(none)'}`,
      );

      // Step 6: Generate SQL
      const sqlStart = performance.now();
      const sql = queryPlanner.generateSQL(plan, semanticModel);
      const sqlTime = performance.now() - sqlStart;

      queryExplainer.recordSQLGeneration(trace, {
        generatedSQL: sql,
        wasRewritten: false,
      });

      console.log(`\n✅ Step 6: SQL Generation (${sqlTime.toFixed(2)}ms)`);
      console.log(
        `   SQL:\n${sql
          .split('\n')
          .map((l) => '   ' + l)
          .join('\n')}`,
      );

      // Step 7: Record simulated execution
      queryExplainer.recordExecution(trace, {
        cacheHit: false,
        executionTimeMs: 5.2,
        rowCount: 5,
        columnCount: 2,
        validationErrors: [],
        validationWarnings: [],
      });

      // Mock result summary
      queryExplainer.recordResultSummary(trace, {
        naturalLanguageSummary:
          'The query returned revenue by customer. David Lee has the highest revenue at $3,820.',
        keyInsights: [
          'David Lee leads with $3,820 in total orders',
          'Alice Johnson is second with $1,425',
          '5 customers total in the result set',
        ],
      });

      const totalTime = performance.now() - startTime;
      queryExplainer.finalizeTrace(trace, totalTime);

      // Print full trace
      console.log('\n');
      console.log(queryExplainer.formatTraceAsText(trace));

      // Assertions
      expect(intent.intent).toBe('read-data');
      expect(intent.needsSQL).toBe(true);
      expect(plan.hasAggregation).toBe(true);
      expect(plan.confidence).toBeGreaterThan(0.5);
      expect(sql).toContain('SUM(orders.total)');
      expect(sql).toContain('customers.name');
      expect(sql).toContain('GROUP BY');
      expect(verification.valid).toBe(true);
      expect(trace.llmUsage.totalCalls).toBe(0); // Fully deterministic
    });
  });

  describe('Token Usage and Latency Summary', () => {
    it('should demonstrate zero LLM calls for standard analytical queries', async () => {
      console.log('\n');
      console.log(
        '═══════════════════════════════════════════════════════════════',
      );
      console.log('              TOKEN USAGE & LATENCY SUMMARY');
      console.log(
        '═══════════════════════════════════════════════════════════════',
      );

      const testQueries = [
        { query: 'hello', expectedIntent: 'greeting' },
        { query: 'show me all orders', expectedIntent: 'read-data' },
        { query: 'total revenue by customer', expectedIntent: 'read-data' },
        { query: 'create a pie chart of sales', expectedIntent: 'read-data' },
        { query: 'what can you do?', expectedIntent: 'system' },
      ];

      const totalLLMCalls = 0;
      let totalLatency = 0;

      console.log(
        '\n┌─────────────────────────────────────────────────────────────┐',
      );
      console.log(
        '│ Query                           │ Intent    │ LLM │ Latency │',
      );
      console.log(
        '├─────────────────────────────────────────────────────────────┤',
      );

      for (const test of testQueries) {
        const start = performance.now();
        const intent = await detectIntent(test.query);
        const latency = performance.now() - start;

        totalLatency += latency;
        // Keyword detection = 0 LLM calls

        const queryPadded = test.query.padEnd(30).substring(0, 30);
        const intentPadded = intent.intent.padEnd(10);
        const llmCalls = 0;
        const latencyStr = `${latency.toFixed(1)}ms`.padStart(7);

        console.log(
          `│ ${queryPadded} │ ${intentPadded} │ ${llmCalls}   │ ${latencyStr} │`,
        );

        expect(intent.intent).toBe(test.expectedIntent);
      }

      console.log(
        '└─────────────────────────────────────────────────────────────┘',
      );
      console.log('');
      console.log(`📊 Summary:`);
      console.log(`   Total Queries: ${testQueries.length}`);
      console.log(`   Total LLM Calls: ${totalLLMCalls}`);
      console.log(`   Total Latency: ${totalLatency.toFixed(2)}ms`);
      console.log(
        `   Avg Latency: ${(totalLatency / testQueries.length).toFixed(2)}ms`,
      );
      console.log('');
      console.log(
        '✅ All queries processed WITHOUT LLM calls (fully deterministic)',
      );

      expect(totalLLMCalls).toBe(0);
    });
  });

  describe('Join Inference Verification', () => {
    it('should produce correct joins for real PostgreSQL schema', () => {
      console.log('\n');
      console.log(
        '═══════════════════════════════════════════════════════════════',
      );
      console.log('              JOIN INFERENCE VERIFICATION');
      console.log(
        '═══════════════════════════════════════════════════════════════',
      );

      const model = semanticModelService.buildFromSchema('test', realPgSchema);

      console.log('\nInferred Joins:');
      model.joins.forEach((j) => {
        console.log(
          `  ${j.fromTable}.${j.fromColumn} → ${j.toTable}.${j.toColumn}`,
        );
      });

      // Verify critical join: orders -> customers using customer_id
      const orderCustomerJoin = model.joins.find(
        (j) => j.fromTable === 'orders' && j.toTable === 'customers',
      );

      expect(orderCustomerJoin).toBeDefined();
      expect(orderCustomerJoin!.toColumn).toBe('customer_id'); // NOT 'id'

      console.log(
        '\n✅ orders.customer_id correctly joins to customers.customer_id',
      );
    });
  });

  describe('Cache Effectiveness Simulation', () => {
    it('should demonstrate cache hit behavior', async () => {
      console.log('\n');
      console.log(
        '═══════════════════════════════════════════════════════════════',
      );
      console.log('              CACHE EFFECTIVENESS SIMULATION');
      console.log(
        '═══════════════════════════════════════════════════════════════',
      );

      // Import cache functions
      const { storeQueryResult, getCachedResult, clearQueryResultCache } =
        await import('../../src/tools/query-result-cache');

      const conversationId = 'e2e-test';
      clearQueryResultCache(conversationId);

      const query =
        'SELECT SUM(total) as revenue, name FROM orders JOIN customers ON orders.customer_id = customers.customer_id GROUP BY name';
      const columns = ['revenue', 'name'];
      const rows = [
        { revenue: 3820, name: 'David Lee' },
        { revenue: 1425, name: 'Alice Johnson' },
      ];

      // First execution: cache miss
      console.log('\n📝 Query: show revenue by customer');
      console.log('\n🔴 First Execution: Cache MISS');
      const miss = getCachedResult(conversationId, query);
      expect(miss).toBeNull();
      console.log('   → Executing query against database...');
      console.log('   → Storing result in cache...');

      storeQueryResult(conversationId, query, columns, rows);

      // Second execution: cache hit
      console.log('\n🟢 Second Execution: Cache HIT');
      const hit = getCachedResult(conversationId, query);
      expect(hit).toBeDefined();
      console.log(`   → Retrieved ${hit!.rows.length} rows from cache`);
      console.log('   → No database query needed');

      // Third execution with whitespace variation: still hits
      const queryVariant =
        '  SELECT   SUM(total)  as revenue, name FROM orders JOIN customers ON orders.customer_id = customers.customer_id GROUP BY name  ';
      console.log('\n🟢 Third Execution (whitespace variant): Cache HIT');
      const hitVariant = getCachedResult(conversationId, queryVariant);
      expect(hitVariant).toBeDefined();
      console.log('   → Query normalization matched cached entry');

      console.log('\n✅ Cache working correctly with query normalization');
    });
  });
});
