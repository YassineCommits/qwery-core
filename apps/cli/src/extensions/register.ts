import { z } from 'zod';

import { ExtensionScope, registerExtension } from '@qwery/extensions-sdk';

import { PostgresDatasourceDriver } from './postgres-driver';

let registered = false;

export function registerCliExtensions(): void {
  if (registered) {
    return;
  }

  registerExtension({
    id: 'postgresql',
    name: 'PostgreSQL',
    description: 'Connect to PostgreSQL databases using the pg driver',
    logo: '/images/datasources/postgresql.png',
    scope: ExtensionScope.DATASOURCE,
    schema: z.object({
      connectionUrl: z
        .string()
        .url()
        .describe(
          'PostgreSQL connection string (postgresql://user:pass@host:port/db)',
        ),
    }),
    getDriver: async (name, config) => {
      return new PostgresDatasourceDriver(name, config as { connectionUrl: string });
    },
  });

  registered = true;
}

