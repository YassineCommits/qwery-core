'use server';

import { AgentFactory, StateData, StateMachineDefinition } from '../';
import { MANAGER_AGENT_PROMPT } from './manager.agent.prompt';
import { Experimental_Agent, stepCountIs, tool } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { extractSchema } from '../tools/extract-schema';
import { gsheetToDuckdb } from '../tools/gsheet-to-duckdb';
import { runQuery } from '../tools/run-query';
import { testConnection } from '../tools/test-connection';

const WORKSPACE = import.meta.env.VITE_WORKING_DIR;

export const MANAGER_STATE_MACHINE: StateMachineDefinition<StateData> = {
  id: 'fsm.text-to-sql.v1',
  name: 'Text to SQL State Machine',
  initialPhase: 'idle',
  terminalPhases: new Set(['done', 'error']),
  transitions: [
    { from: 'idle', command: 'start', to: 'detect-intent' },
    {
      from: 'detect-intent',
      command: 'intent-detected',
      to: 'summarize-intent',
    },
    {
      from: 'detect-intent',
      command: 'intent-not-clear',
      to: 'resolve-intent',
    },
    { from: 'detect-intent', command: 'needs-context', to: 'gather-context' },
    {
      from: 'gather-context',
      command: 'context-gathered',
      to: 'detect-intent',
    },
    {
      from: 'resolve-intent',
      command: 'intent-resolved',
      to: 'summarize-intent',
    },
    {
      from: 'resolve-intent',
      command: 'intent-not-resolved',
      to: 'resolve-intent',
    },
    {
      from: 'summarize-intent',
      command: 'intent-confirmed',
      to: 'create-task',
    },
    {
      from: 'summarize-intent',
      command: 'intent-not-confirmed',
      to: 'resolve-intent',
    },
    { from: 'create-task', command: 'task-created', to: 'execute-task' },
    { from: 'execute-task', command: 'task-executed', to: 'done' },
  ],
};

export interface ManagerAgentOptions {
  conversationId: string;
}

export class ManagerAgent {
  private readonly factory = new AgentFactory();
  private readonly agent: ReturnType<ManagerAgent['createAgent']>;
  private readonly conversationId: string;

  constructor(opts: ManagerAgentOptions) {
    this.conversationId = opts.conversationId;

    const model = this.factory.resolveModel({
      name: 'azure/gpt-5-mini',
    });

    if (!isLanguageModel(model)) {
      throw new Error('AgentFactory resolved model is not a LanguageModel');
    }

    this.agent = this.createAgent(model);
  }

  getAgent(): ReturnType<ManagerAgent['createAgent']> {
    return this.agent;
  }

  private createAgent(model: LanguageModel) {
    return new Experimental_Agent({
      model,
      system: MANAGER_AGENT_PROMPT,
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
