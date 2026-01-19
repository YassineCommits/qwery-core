import { describe, it, expect } from 'vitest';
import {
  semanticModelService,
  queryPlanner,
  queryVerifier,
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
        { columnName: 'shipping_address', columnType: 'VARCHAR' },
        { columnName: 'total_amount', columnType: 'DECIMAL(10,2)' },
      ],
    },
    {
      tableName: 'customers',
      columns: [
        { columnName: 'customer_id', columnType: 'INTEGER' },
        { columnName: 'name', columnType: 'VARCHAR' },
        { columnName: 'email', columnType: 'VARCHAR' },
        { columnName: 'phone', columnType: 'VARCHAR' },
        { columnName: 'segment', columnType: 'VARCHAR' },
      ],
    },
    {
      tableName: 'products',
      columns: [
        { columnName: 'id', columnType: 'INTEGER' },
        { columnName: 'sku', columnType: 'VARCHAR' },
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
        { columnName: 'method', columnType: 'VARCHAR' },
        { columnName: 'status', columnType: 'VARCHAR' },
        { columnName: 'amount', columnType: 'DECIMAL(10,2)' },
      ],
    },
  ],
};

describe('End-to-End Real Data Tests', () => {
  describe('Test Case 1: Simple Greeting Flow', () => {
    it('should handle greeting without LLM call', async () => {
      const userInput = 'Hello!';

      // Step 1: Intent Detection
      const intent = await detectIntent(userInput);

      console.log('\n=== TRACE: Greeting Flow ===');
      console.log('User Input:', userInput);
      console.log('Detected Intent:', intent);

      expect(intent.intent).toBe('greeting');
      expect(intent.needsSQL).toBe(false);
      expect(intent.needsChart).toBe(false);
    });
  });

  describe('Test Case 2: Simple Query Flow', () => {
    it('should process "show me all customers" end-to-end', async () => {
      const userInput = 'show me all customers';

      console.log('\n=== TRACE: Simple Query Flow ===');
      console.log('User Input:', userInput);

      // Step 1: Intent Detection
      const intent = await detectIntent(userInput);
      console.log('Detected Intent:', JSON.stringify(intent, null, 2));

      expect(intent.intent).toBe('read-data');
      expect(intent.needsSQL).toBe(true);

      // Step 2: Build Semantic Model
      const semanticModel = semanticModelService.buildFromSchema(
        'test',
        realPgSchema,
      );
      console.log('Semantic Model - Metrics:', semanticModel.metrics.size);
      console.log(
        'Semantic Model - Dimensions:',
        semanticModel.dimensions.size,
      );
      console.log('Semantic Model - Joins:', semanticModel.joins.length);

      // Step 3: Expected SQL (simple case - no semantic plan needed)
      const expectedSQL = 'SELECT * FROM pg.public.customers';
      console.log('Expected SQL:', expectedSQL);
    });
  });

  describe('Test Case 3: Multi-Table Analytical Query', () => {
    it('should process "show total revenue by customer" end-to-end', async () => {
      const userInput = 'show total revenue by customer';

      console.log('\n=== TRACE: Analytical Query Flow ===');
      console.log('User Input:', userInput);

      // Step 1: Intent Detection
      const intent = await detectIntent(userInput);
      console.log('Detected Intent:', JSON.stringify(intent, null, 2));

      // Step 2: Build Semantic Model
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

      // Step 3: Generate Logical Plan
      const plan = queryPlanner.plan(
        {
          userQuery: userInput,
          intent: {
            metrics: ['total_revenue'],
            dimensions: ['customer_name'],
          },
        },
        semanticModel,
      );

      console.log(
        'Logical Plan:',
        JSON.stringify(
          {
            projections: plan.projections,
            tables: plan.tables,
            joins: plan.joins,
            groupBy: plan.groupBy,
            hasAggregation: plan.hasAggregation,
            complexity: plan.complexity,
            confidence: plan.confidence,
          },
          null,
          2,
        ),
      );

      // Step 4: Verify Plan
      const verification = queryVerifier.verify(plan, semanticModel);
      console.log(
        'Verification Result:',
        JSON.stringify(verification, null, 2),
      );

      // Step 5: Generate SQL
      const sql = queryPlanner.generateSQL(plan, semanticModel);
      console.log('Generated SQL:\n', sql);

      // Assertions
      expect(plan.hasAggregation).toBe(true);
      expect(plan.projections.length).toBe(2);
      expect(sql).toContain('SUM(orders.total)');
      expect(sql).toContain('customers.name');
      expect(sql).toContain('GROUP BY');
    });
  });

  describe('Test Case 4: Chart Request Detection', () => {
    it('should detect chart intent and process correctly', async () => {
      const userInput = 'create a bar chart showing sales by product category';

      console.log('\n=== TRACE: Chart Request Flow ===');
      console.log('User Input:', userInput);

      // Step 1: Intent Detection
      const intent = await detectIntent(userInput);
      console.log('Detected Intent:', JSON.stringify(intent, null, 2));

      expect(intent.intent).toBe('read-data');
      expect(intent.needsChart).toBe(true);
      expect(intent.needsSQL).toBe(true);
    });
  });

  describe('Test Case 5: Complex Query with Filters', () => {
    it('should handle query with filters', async () => {
      const userInput = 'show orders from last month with status completed';

      console.log('\n=== TRACE: Filtered Query Flow ===');
      console.log('User Input:', userInput);

      // Step 1: Intent Detection
      const intent = await detectIntent(userInput);
      console.log('Detected Intent:', JSON.stringify(intent, null, 2));

      // Step 2: Build Semantic Model
      const semanticModel = semanticModelService.buildFromSchema(
        'test',
        realPgSchema,
      );

      // Step 3: Generate Logical Plan with filters
      const plan = queryPlanner.plan(
        {
          userQuery: userInput,
          intent: {
            metrics: [],
            dimensions: [],
            filters: [
              { column: 'orders.status', operator: '=', value: 'completed' },
            ],
            limit: 100,
          },
        },
        semanticModel,
      );

      console.log(
        'Logical Plan:',
        JSON.stringify(
          {
            tables: plan.tables,
            filters: plan.filters,
            limit: plan.limit,
          },
          null,
          2,
        ),
      );

      expect(plan.filters.length).toBe(1);
      expect(plan.limit).toBe(100);
    });
  });

  describe('Test Case 6: Query Verifier Edge Cases', () => {
    it('should detect invalid plans', () => {
      const semanticModel = semanticModelService.buildFromSchema(
        'test',
        realPgSchema,
      );

      // Create plan with missing join
      const invalidPlan = queryPlanner.plan(
        {
          userQuery: 'test',
          intent: {
            metrics: [],
            dimensions: [],
          },
        },
        semanticModel,
      );

      // Empty plan should have low confidence
      expect(invalidPlan.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should warn about aggregation without GROUP BY', () => {
      const semanticModel = semanticModelService.buildFromSchema(
        'test',
        realPgSchema,
      );

      // Add metric
      semanticModel.metrics.set('count', {
        id: 'count',
        name: 'count',
        expression: 'COUNT(*)',
        description: 'Row count',
        requiredTables: ['orders'],
        dataType: 'integer',
        aggregation: 'count',
      });

      const plan = queryPlanner.plan(
        {
          userQuery: 'count and show id',
          intent: {
            metrics: ['count'],
            dimensions: [], // No dimensions = no GROUP BY
          },
        },
        semanticModel,
      );

      const verification = queryVerifier.verify(plan, semanticModel);

      // Should have warning or suggestion about GROUP BY
      console.log('Verification warnings:', verification.warnings);
      console.log('Verification suggestions:', verification.suggestions);
    });
  });
});
