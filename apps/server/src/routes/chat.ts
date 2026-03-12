import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  prompt,
  getDefaultModel,
  validateUIMessages,
  PROMPT_SOURCE,
  type PromptSource,
  type NotebookCellType,
  type UIMessage,
} from '@qwery/agent-factory-sdk';
import { normalizeUIRole } from '@qwery/shared/message-role-utils';
import type { Repositories } from '@qwery/domain/repositories';
import { createRepositories } from '../lib/repositories';
import { getTelemetry } from '../lib/telemetry';
import { resolveChatDatasources } from '../helpers/chat-helper';
import { handleDomainException } from '../lib/http-utils';
import { getTracingSdk } from '../lib/tracing';
import { buildInteractionFromTraceAndSend } from '../infra/evals/eval-client';

const chatBodySchema = z.object({
  messages: z.array(z.unknown()),
  model: z.string().optional(),
  datasources: z.array(z.string()).optional(),
  trigger: z.enum(['submit-message', 'regenerate-message']).optional(),
});

const chatParamSchema = z.object({
  slug: z.string().min(1),
});

let repositoriesPromise: Promise<Repositories> | undefined;

async function getRepositories(): Promise<Repositories> {
  if (!repositoriesPromise) {
    repositoriesPromise = createRepositories();
  }
  return repositoriesPromise;
}

export function createChatRoutes() {
  const app = new Hono();

  app.post(
    '/:slug',
    zValidator('param', chatParamSchema),
    zValidator('json', chatBodySchema),
    async (c) => {
      try {
        const { slug } = c.req.valid('param');
        const body = c.req.valid('json');
        const messages = body.messages as UIMessage[];
        const model = body.model ?? getDefaultModel();

        const repositories = await getRepositories();
        const datasources = await resolveChatDatasources({
          bodyDatasources: body.datasources,
          messages,
          conversationSlug: slug,
          conversationRepository: repositories.conversation,
        });
        const telemetry = await getTelemetry();

        const needSQL = false;

        const processedMessages = messages.map(
          (message: UIMessage, index: number) => {
            const isLastUserMessage =
              normalizeUIRole(message.role) === 'user' &&
              index === messages.length - 1;

            if (isLastUserMessage) {
              const messageMetadata = (message.metadata ?? {}) as Record<
                string,
                unknown
              >;
              const isNotebookSource =
                messageMetadata.promptSource === PROMPT_SOURCE.INLINE ||
                messageMetadata.notebookCellType !== undefined;
              const promptSource: PromptSource = isNotebookSource
                ? PROMPT_SOURCE.INLINE
                : PROMPT_SOURCE.CHAT;
              const notebookCellType = messageMetadata.notebookCellType as
                | NotebookCellType
                | undefined;

              const cleanMetadata = { ...messageMetadata };
              delete (cleanMetadata as Record<string, unknown>).source;

              return {
                ...message,
                metadata: {
                  ...cleanMetadata,
                  promptSource,
                  needSQL,
                  ...(notebookCellType ? { notebookCellType } : {}),
                  ...(datasources && datasources.length > 0
                    ? { datasources }
                    : {}),
                },
              };
            }

            if (normalizeUIRole(message.role) === 'user') {
              const textPart = message.parts?.find(
                (p): p is { type: 'text'; text: string } =>
                  p.type === 'text' && 'text' in p,
              );
              if (textPart) {
                const text = textPart.text;
                const guidanceMarker = '__QWERY_SUGGESTION_GUIDANCE__';
                const guidanceEndMarker = '__QWERY_SUGGESTION_GUIDANCE_END__';

                if (text.includes(guidanceMarker)) {
                  const endIndex = text.indexOf(guidanceEndMarker);
                  if (endIndex !== -1) {
                    const cleanText = text
                      .substring(endIndex + guidanceEndMarker.length)
                      .trim();

                    const suggestionGuidance = `[SUGGESTION WORKFLOW GUIDANCE]
- This is a suggested next step from a previous response - execute it directly and efficiently
- Use the provided context (previous question/answer) to understand the full conversation flow
- Be action-oriented: proceed immediately with the requested operation without asking for confirmation
- Keep your response concise and focused on delivering the requested result
- If the suggestion involves a query or analysis, execute it and present the findings clearly

User request: ${cleanText}`;

                    return {
                      ...message,
                      parts: message.parts?.map((part) => {
                        if (part.type === 'text' && 'text' in part) {
                          return { ...part, text: suggestionGuidance };
                        }
                        return part;
                      }),
                    };
                  }
                }
              }
            }

            return message;
          },
        );

        const validatedMessages = await validateUIMessages({
          messages: processedMessages,
        });

        const mcpServerUrl =
          process.env.QWERY_MCP_SERVER_URL ??
          `${new URL(c.req.url).origin}/mcp`;

        // ── Tracing (non-blocking, fail-silent) ──────────────────────────────
        const tracing = getTracingSdk();
        const lastUserMessage = messages.findLast(
          (m) => normalizeUIRole(m.role) === 'user',
        );
        const extractText = (msg: unknown): string => {
          if (!msg) return '';
          if (typeof msg === 'string') return msg;
          const m = msg as Record<string, unknown>;
          if (typeof m['content'] === 'string') return m['content'];
          if (Array.isArray(m['parts'])) {
            return (m['parts'] as Array<Record<string, unknown>>)
              .filter((p) => p['type'] === 'text')
              .map((p) => p['text'])
              .join(' ') as string;
          }
          return JSON.stringify(msg);
        };
        const turnStartedAt = Date.now();
        const traceSession = tracing
          ? await tracing.startTrace({
              projectId: slug,
              agentVersion: '1',
              modelName: model,
              input: extractText(lastUserMessage),
              metadata: { conversationSlug: slug, trigger: body.trigger },
            })
          : undefined;

        type TraceSessionCompletePayload = {
          output: unknown;
          metadata?: Record<string, unknown>;
        };

        type EvalTraceSession = {
          complete?: (payload: TraceSessionCompletePayload) => void;
          id?: string;
          addStep: (params: {
            type:
              | 'llm_call'
              | 'tool_call'
              | 'retrieval'
              | 'reasoning'
              | 'custom';
            name: string;
            input: unknown;
            output: unknown;
            tokenUsage?: {
              promptTokens: number;
              completionTokens: number;
              totalTokens: number;
            } | null;
            error?: string | null;
            latencyMs: number;
            startedAt: Date;
            endedAt: Date;
            metadata?: Record<string, unknown>;
            artifacts?: Array<{
              name: string;
              type: 'table' | 'chart' | 'image' | 'sql' | 'text';
              mimeType: string;
              data: string;
              encoding: 'utf8' | 'base64';
            }>;
          }) => void;
          addLlmStep: (params: {
            name: string;
            input: unknown;
            output: unknown;
            tokenUsage?: {
              promptTokens: number;
              completionTokens: number;
              totalTokens: number;
            } | null;
            error?: string | null;
            latencyMs: number;
            startedAt: Date;
            endedAt: Date;
            metadata?: Record<string, unknown>;
          }) => void;
          addToolStep: (params: {
            name: string;
            input: unknown;
            output: unknown;
            error?: string | null;
            latencyMs: number;
            startedAt: Date;
            endedAt: Date;
            metadata?: Record<string, unknown>;
            artifacts?: Array<{
              name: string;
              type: 'table' | 'chart' | 'image' | 'sql' | 'text';
              mimeType: string;
              data: string;
              encoding: 'utf8' | 'base64';
            }>;
          }) => void;
          addRetrievalStep: (params: {
            name: string;
            input: unknown;
            output: unknown;
            error?: string | null;
            latencyMs: number;
            startedAt: Date;
            endedAt: Date;
            metadata?: Record<string, unknown>;
          }) => void;
        };

        let hasCompletedTrace = false;

        const evalTraceSession: EvalTraceSession | undefined = traceSession
          ? {
              addStep: traceSession.addStep.bind(traceSession),
              addLlmStep: traceSession.addLlmStep.bind(traceSession),
              addToolStep: traceSession.addToolStep.bind(traceSession),
              addRetrievalStep:
                traceSession.addRetrievalStep.bind(traceSession),
              id: traceSession.id,
              complete: (payload: TraceSessionCompletePayload) => {
                if (hasCompletedTrace) {
                  return;
                }

                hasCompletedTrace = true;
                traceSession.complete(payload);

                void (async () => {
                  const userTurnIndex = messages.filter(
                    (m) => normalizeUIRole(m.role) === 'user',
                  ).length;

                  await buildInteractionFromTraceAndSend({
                    traceId: traceSession.id,
                    app: 'web',
                    env: process.env.NODE_ENV ?? 'dev',
                    sessionId: slug,
                    turnIndex: userTurnIndex,
                    agentName: 'query',
                    agentVersion: '1',
                    modelName:
                      typeof model === 'string' ? model : String(model),
                    taskType: 'code_help',
                  });
                })();
              },
            }
          : undefined;

        const response = await prompt({
          conversationSlug: slug,
          messages: validatedMessages,
          model,
          datasources,
          repositories,
          telemetry,
          generateTitle: true,
          mcpServerUrl,
          traceSession: evalTraceSession,
        }).catch((err: unknown) => {
          traceSession?.fail({
            error: err instanceof Error ? err.message : String(err),
          });
          void tracing?.flush();
          throw err;
        });

        const latencyMs = Date.now() - turnStartedAt;

        await tracing?.flush();

        return response;
      } catch (error) {
        return handleDomainException(error);
      }
    },
  );

  return app;
}
