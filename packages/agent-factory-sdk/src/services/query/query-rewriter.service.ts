import { extractTablePathsFromQuery } from '../../tools/validate-table-paths';

export interface PathMapping {
  displayPath: string;
  queryPath: string;
}

export interface RewriteResult {
  originalQuery: string;
  rewrittenQuery: string;
  replacements: Array<{ from: string; to: string }>;
  wasRewritten: boolean;
}

/**
 * Query Rewriter Service
 * Handles path rewriting for different database providers
 * Currently supports ClickHouse display path -> query path conversion
 */
export class QueryRewriterService {
  /**
   * Rewrite table paths in a SQL query
   * Converts display paths (datasource.default.table) to query paths (datasource.main.table)
   * This is needed for ClickHouse where SQLite attached databases only support 'main' schema
   */
  rewrite(
    query: string,
    pathMappings: Map<string, string>,
    allAvailablePaths: string[],
  ): RewriteResult {
    const tablePaths = extractTablePathsFromQuery(query);
    const replacements: Array<{ from: string; to: string }> = [];
    let rewrittenQuery = query;

    for (const tablePath of tablePaths) {
      const parts = tablePath.split('.');

      // Only process three-part paths (datasource.schema.table)
      if (parts.length !== 3) {
        continue;
      }

      const [datasourceName, schemaName, tableName] = parts;

      // Skip if schema is already 'main' (no rewriting needed)
      if (schemaName === 'main') {
        continue;
      }

      // Try to get the query path from the mapping
      const queryPath = pathMappings.get(tablePath);

      if (queryPath) {
        replacements.push({ from: tablePath, to: queryPath });
      } else {
        // Fallback: construct query path manually
        const constructedQueryPath = `${datasourceName}.main.${tableName}`;

        if (allAvailablePaths.includes(constructedQueryPath)) {
          replacements.push({ from: tablePath, to: constructedQueryPath });
        }
      }
    }

    // Apply all replacements
    if (replacements.length > 0) {
      for (const { from, to } of replacements) {
        rewrittenQuery = this.replaceTablePath(rewrittenQuery, from, to);
      }
    }

    return {
      originalQuery: query,
      rewrittenQuery,
      replacements,
      wasRewritten: replacements.length > 0,
    };
  }

  /**
   * Replace a table path in SQL while preserving quote styles
   */
  private replaceTablePath(sql: string, from: string, to: string): string {
    const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const patterns = [
      new RegExp(`\\b${escapedFrom}\\b`, 'g'),
      new RegExp(`"${escapedFrom}"`, 'g'),
      new RegExp(`'${escapedFrom}'`, 'g'),
    ];

    let result = sql;

    for (const pattern of patterns) {
      result = result.replace(pattern, (match) => {
        if (match.startsWith('"') && match.endsWith('"')) {
          return `"${to}"`;
        }
        if (match.startsWith("'") && match.endsWith("'")) {
          return `'${to}'`;
        }
        return to;
      });
    }

    return result;
  }
}

export const queryRewriter = new QueryRewriterService();
