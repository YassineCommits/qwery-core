'use server';

import { AgentFactory } from '../..';
import { Experimental_Agent, stepCountIs, tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { extractSchema } from '../../tools/extract-schema';
import { gsheetToDuckdb } from '../../tools/gsheet-to-duckdb';
import { runQuery } from '../../tools/run-query';
import { testConnection } from '../../tools/test-connection';
import { fromPromise } from 'xstate/actors';
import { READ_DATA_AGENT_PROMPT } from '../prompts/read-data-agent.prompt';

export const readDataAgentActor = fromPromise(
  async ({
    input,
  }: {
    input: {
      inputMessage: string;
      conversationId: string;
    };
  }) => {
    const agent = new ReadDataAgent({
      conversationId: input.conversationId,
    });
    const result = agent.getAgent().stream({
      prompt: input.inputMessage,
    });
    return result;
  },
);

const WORKSPACE = import.meta.env.VITE_WORKING_DIR;

export interface ReadDataAgentOptions {
  conversationId: string;
}

export class ReadDataAgent {
  private readonly factory = new AgentFactory();
  private readonly agent: ReturnType<ReadDataAgent['createAgent']>;
  private readonly conversationId: string;

  constructor(opts: ReadDataAgentOptions) {
    this.conversationId = opts.conversationId;

    const model = this.factory.resolveModel({
      name: 'azure/gpt-5-mini',
    });

    if (!isLanguageModel(model)) {
      throw new Error('AgentFactory resolved model is not a LanguageModel');
    }

    this.agent = this.createAgent(model);

    console.log(
      `###ReadDataAgent created for conversation ${this.conversationId}`,
    );
  }

  getAgent(): ReturnType<ReadDataAgent['createAgent']> {
    return this.agent;
  }

  private createAgent(model: LanguageModel) {
    return new Experimental_Agent({
      model,
      system: READ_DATA_AGENT_PROMPT,
      tools: {
        testConnection: tool({
          description:
            'Test the connection to the database to check if the database is accessible',
          inputSchema: z.object({}),
          execute: async () => {
            if (!WORKSPACE) {
              throw new Error('WORKSPACE environment variable is not set');
            }
            const { join } = await import('node:path');
            const dbPath = join(WORKSPACE, this.conversationId, 'database.db');
            console.log('DB path:', dbPath);
            const result = await testConnection({
              dbPath: dbPath,
            });
            console.log('Connect status:', result);
            return result.toString();
          },
        }),
        createDbViewFromSheet: tool({
          description: 'Create a View from a Google Sheet',
          inputSchema: z.object({
            sharedLink: z.string(),
          }),
          execute: async ({ sharedLink }) => {
            if (!WORKSPACE) {
              throw new Error('WORKSPACE environment variable is not set');
            }
            const { join } = await import('node:path');
            const { mkdir } = await import('node:fs/promises');

            const workspace = WORKSPACE;
            await mkdir(workspace, { recursive: true });
            const fileDir = join(workspace, this.conversationId);
            await mkdir(fileDir, { recursive: true });
            const dbPath = join(fileDir, 'database.db');

            const message = await gsheetToDuckdb({
              dbPath,
              sharedLink,
            });
            return {
              content: message,
            };
          },
        }),
        getSchema: tool({
          description: 'Get the schema of the Google Sheet view',
          inputSchema: z.object({}),
          execute: async () => {
            if (!WORKSPACE) {
              throw new Error('WORKSPACE environment variable is not set');
            }
            const { join } = await import('node:path');
            const dbPath = join(WORKSPACE, this.conversationId, 'database.db');

            const schema = await extractSchema({ dbPath });
            return {
              schema: schema,
            };
          },
        }),
        runQuery: tool({
          description: 'Run a SQL query against the Google Sheet view',
          inputSchema: z.object({
            query: z.string(),
          }),
          execute: async ({ query }) => {
            if (!WORKSPACE) {
              throw new Error('WORKSPACE environment variable is not set');
            }
            const { join } = await import('node:path');
            const dbPath = join(WORKSPACE, this.conversationId, 'database.db');

            const result = await runQuery({
              dbPath,
              query,
            });
            return {
              result: result,
            };
          },
        }),
      },
      stopWhen: stepCountIs(20), // Stop after 20 steps maximum
    });
  }
}

function isLanguageModel(model: unknown): model is LanguageModel {
  return typeof model === 'object' && model !== null;
}
