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
import { MessageRole } from '@qwery/domain/entities';
import type { Repositories } from '@qwery/domain/repositories';
import { createRepositories } from '../lib/repositories';
import { getTelemetry } from '../lib/telemetry';
import { resolveChatDatasources } from '../helpers/chat-helper';
import { handleDomainException } from '../lib/http-utils';

const DATA_ANALYSIS_CONSENT_START = '__QWERY_DATA_ANALYSIS_CONSENT__';
const DATA_ANALYSIS_CONSENT_END = '__QWERY_DATA_ANALYSIS_CONSENT_END__';

function extractDataAnalysisConsentFromText(text: string): {
  cleanedText: string;
  consent?: { approved: boolean; limit?: number };
} {
  const start = text.indexOf(DATA_ANALYSIS_CONSENT_START);
  if (start === -1) return { cleanedText: text };
  const jsonStart = start + DATA_ANALYSIS_CONSENT_START.length;
  const end = text.indexOf(DATA_ANALYSIS_CONSENT_END, jsonStart);
  if (end === -1) return { cleanedText: text };

  const rawJson = text.slice(jsonStart, end).trim();
  try {
    const parsed = JSON.parse(rawJson) as {
      approved?: unknown;
      limit?: unknown;
    };
    if (typeof parsed?.approved !== 'boolean') {
      return { cleanedText: text };
    }
    const cleanedText = (
      text.slice(0, start) + text.slice(end + DATA_ANALYSIS_CONSENT_END.length)
    ).trim();
    const limit =
      typeof parsed.limit === 'number' && Number.isFinite(parsed.limit)
        ? Math.floor(parsed.limit)
        : undefined;
    return {
      cleanedText,
      consent: { approved: parsed.approved, ...(limit ? { limit } : {}) },
    };
  } catch {
    return { cleanedText: text };
  }
}

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
        if (body.trigger === 'regenerate-message') {
          const conversation = await repositories.conversation.findBySlug(slug);
          if (conversation) {
            const convMessages =
              await repositories.message.findByConversationId(conversation.id);
            const lastMessage = convMessages.at(-1);
            if (lastMessage && lastMessage.role === MessageRole.ASSISTANT) {
              await repositories.message.delete(lastMessage.id);
            }
          }
        }
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

              const textPart = message.parts?.find(
                (p): p is { type: 'text'; text: string } =>
                  p.type === 'text' && 'text' in p,
              );
              const extracted = textPart
                ? extractDataAnalysisConsentFromText(textPart.text)
                : null;

              return {
                ...message,
                parts: extracted
                  ? message.parts?.map((part) => {
                      if (part.type === 'text' && 'text' in part) {
                        return { ...part, text: extracted.cleanedText };
                      }
                      return part;
                    })
                  : message.parts,
                metadata: {
                  ...cleanMetadata,
                  ...(extracted?.consent
                    ? { dataAnalysisConsent: extracted.consent }
                    : {}),
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
                const extracted = extractDataAnalysisConsentFromText(
                  textPart.text,
                );
                const text = extracted.cleanedText;
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
                      metadata: {
                        ...(message.metadata ?? {}),
                        ...(extracted.consent
                          ? { dataAnalysisConsent: extracted.consent }
                          : {}),
                      },
                    };
                  }
                }

                if (extracted.consent) {
                  return {
                    ...message,
                    parts: message.parts?.map((part) => {
                      if (part.type === 'text' && 'text' in part) {
                        return { ...part, text: extracted.cleanedText };
                      }
                      return part;
                    }),
                    metadata: {
                      ...(message.metadata ?? {}),
                      dataAnalysisConsent: extracted.consent,
                    },
                  };
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

        const response = await prompt({
          conversationSlug: slug,
          messages: validatedMessages,
          model,
          datasources,
          repositories,
          telemetry,
          generateTitle: true,
          mcpServerUrl,
        });

        return response;
      } catch (error) {
        return handleDomainException(error);
      }
    },
  );

  return app;
}
