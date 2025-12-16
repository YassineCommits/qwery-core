import type { AbstractQueryEngine } from '@qwery/domain/ports';

export interface DeleteTableOptions {
  tableNames: string[];
  queryEngine: AbstractQueryEngine;
}

export interface DeleteTableResult {
  deletedTables: string[];
  failedTables: Array<{ tableName: string; error: string }>;
  message: string;
}

export const deleteTable = async (
  opts: DeleteTableOptions,
): Promise<DeleteTableResult> => {
  const { tableNames, queryEngine } = opts;

  if (!tableNames || tableNames.length === 0) {
    throw new Error('At least one table name is required');
  }

  if (!queryEngine) {
    throw new Error('Query engine is required');
  }

  const deletedTables: string[] = [];
  const failedTables: Array<{ tableName: string; error: string }> = [];

  // Delete each table using queryEngine
  for (const tableName of tableNames) {
    try {
      const escapedName = tableName.replace(/"/g, '""');
      // Try to drop as VIEW first, then as TABLE
      // DROP VIEW IF EXISTS and DROP TABLE IF EXISTS won't error if the object doesn't exist
      await queryEngine.query(`DROP VIEW IF EXISTS "${escapedName}"`);
      await queryEngine.query(`DROP TABLE IF EXISTS "${escapedName}"`);
      deletedTables.push(tableName);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      failedTables.push({ tableName, error: errorMsg });
    }
  }

  const successCount = deletedTables.length;
  const failCount = failedTables.length;

  let message: string;
  if (successCount === tableNames.length) {
    message = `Successfully deleted ${successCount} table(s): ${deletedTables.join(', ')}`;
  } else if (successCount > 0) {
    message = `Deleted ${successCount} table(s): ${deletedTables.join(', ')}. Failed to delete ${failCount} table(s): ${failedTables.map((f) => f.tableName).join(', ')}`;
  } else {
    message = `Failed to delete all ${failCount} table(s)`;
  }

  return {
    deletedTables,
    failedTables,
    message,
  };
};
