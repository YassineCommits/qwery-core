import { Client } from 'pg';

import type { DatasourceResultSet } from '@qwery/extensions-sdk';
import { DatasourceDriver } from '@qwery/extensions-sdk';

interface PostgresConfig {
  connectionUrl: string;
}

function buildPgConfig(connectionString: string) {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get('sslmode');
  const shouldRelaxTls =
    sslmode === 'require' || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0';

  const ssl = shouldRelaxTls
    ? {
        rejectUnauthorized: false,
        checkServerIdentity: () => undefined,
      }
    : undefined;

  return {
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    database: url.pathname ? url.pathname.replace(/^\//, '') || undefined : undefined,
    ssl,
  };
}

async function withInsecureTls<T>(callback: () => Promise<T>): Promise<T> {
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    return await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  }
}

export class PostgresDatasourceDriver extends DatasourceDriver {
  private client: Client | null = null;

  private get connectionString(): string {
    if (typeof this.config === 'string') {
      return this.config;
    }
    const config = this.config as Partial<PostgresConfig>;
    if (typeof config.connectionUrl !== 'string') {
      throw new Error('PostgreSQL connectionUrl missing from datasource config.');
    }
    return config.connectionUrl;
  }

  private async ensureClient(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    const client = new Client(buildPgConfig(this.connectionString));
    this.client = client;
    return client;
  }

  async connect(): Promise<void> {
    const client = await this.ensureClient();
    await withInsecureTls(async () => {
      await client.connect();
    });
  }

  async close(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.end().catch(() => undefined);
    this.client = null;
  }

  async testConnection(): Promise<boolean> {
    const client = await this.ensureClient();
    await withInsecureTls(async () => {
      await client.connect();
      await client.query('SELECT 1');
    });
    await this.close();
    return true;
  }

  async getCurrentSchema(): Promise<string | null> {
    const result = await this.query(
      `
        SELECT table_schema,
               table_name,
               column_name,
               data_type
        FROM information_schema.columns
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY table_schema, table_name, ordinal_position;
      `,
    );

    if (!result.rows.length) {
      return null;
    }

    const grouped = new Map<string, string[]>();
    for (const row of result.rows) {
      const schema = (row.table_schema as string) ?? 'public';
      const table = (row.table_name as string) ?? 'unknown';
      const column = (row.column_name as string) ?? 'unknown';
      const type = (row.data_type as string) ?? 'text';
      const key = `${schema}.${table}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(`${column} ${type}`);
    }

    return Array.from(grouped.entries())
      .map(([name, columns]) => `${name} (${columns.join(', ')})`)
      .join('\n');
  }

  async query(query: string): Promise<DatasourceResultSet> {
    const client = await this.ensureClient();
    return await withInsecureTls(async () => {
      await client.connect();
      try {
        const result = await client.query(query);
        const headers = result.fields.map((field) => ({
          name: field.name,
          displayName: field.name,
          originalType: field.dataTypeID?.toString() ?? null,
        }));

        return {
          rows: result.rows,
          headers,
          stat: {
            rowsAffected: result.rowCount ?? result.rows.length ?? 0,
            rowsRead: result.rows.length ?? null,
            rowsWritten: null,
            queryDurationMs: null,
          },
        };
      } finally {
        await client.end().catch(() => undefined);
        this.client = null;
      }
    });
  }
}

