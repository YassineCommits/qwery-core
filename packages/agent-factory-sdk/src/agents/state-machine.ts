import { setup, assign } from 'xstate';
import { fromPromise } from 'xstate/actors';
import type { UIMessage } from 'ai';
import { AgentContext, AgentEvents } from './types';
import { detectIntent } from './actors/detect-intent.actor';
import { summarizeIntent } from './actors/summarize-intent.actor';
import { greeting } from './actors/greeting.actor';
import { readDataAgent } from './actors/read-data-agent.actor';
import { loadContext } from './actors/load-context.actor';
import { systemInfoActor } from './actors';
import { MessagePersistenceService } from '../services/message-persistence.service';
import { Repositories } from '@qwery/domain/repositories';
import { createCachedActor } from './utils/actor-cache';
import { AbstractQueryEngine } from '@qwery/domain/ports';
import type { PromptSource } from '../domain';
import type { TelemetryManager } from '@qwery/telemetry/otel';
import {
  createActorAttributes,
  endActorSpanWithEvent,
} from '@qwery/telemetry/otel';
import { AGENT_EVENTS } from '@qwery/telemetry/events/agent.events';
import {
  context as otelContext,
  trace,
  type SpanContext,
} from '@opentelemetry/api';
import { extractTokenUsage, parseModel } from './utils/actor-telemetry';

/**
 * Extract first datasource ID from message metadata for semantic-aware intent detection
 */
function extractDatasourceIdFromMessages(
  messages: UIMessage[],
): string | undefined {
  if (!messages || messages.length === 0) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === 'user' && message.metadata) {
      const metadata = message.metadata as Record<string, unknown>;
      const datasources = metadata.datasources;
      if (
        Array.isArray(datasources) &&
        datasources.length > 0 &&
        typeof datasources[0] === 'string'
      ) {
        return datasources[0];
      }
    }
  }
  return undefined;
}

export const createStateMachine = (
  conversationId: string,
  conversationSlug: string,
  model: string,
  repositories: Repositories,
  queryEngine: AbstractQueryEngine,
  telemetry: TelemetryManager,
  getParentSpanContexts?: () =>
    | Array<{
        context: SpanContext;
        attributes?: Record<string, string | number | boolean>;
      }>
    | undefined,
  storeLoadContextSpan?: (
    span: ReturnType<TelemetryManager['startSpan']>,
  ) => void,
) => {
  // Create telemetry-wrapped actors
  // All actors use startSpan for consistent nesting behavior
  // OpenTelemetry's AsyncLocalStorage should preserve context across async boundaries
  // Context is set when sending USER_INPUT, allowing actors to access parent spans
  const detectIntentActor = fromPromise(
    async ({
      input,
    }: {
      input: {
        inputMessage: string;
        model: string;
        datasourceId?: string;
      };
    }): Promise<AgentContext['intent']> => {
      const startTime = Date.now();
      const {
        provider: _provider,
        modelName: _modelName,
        fullModel: _fullModel,
      } = parseModel(input.model);

      // Create span with actor attributes
      const span = telemetry.startSpan(
        'agent.actor.detectIntent',
        createActorAttributes(
          'detectIntent',
          'detectIntent',
          conversationId,
          input.model,
          { inputMessage: input.inputMessage },
        ),
      );

      telemetry.captureEvent({
        name: AGENT_EVENTS.ACTOR_INVOKED,
        attributes: {
          'agent.actor.id': 'detectIntent',
          'agent.actor.type': 'detectIntent',
          'agent.conversation.id': conversationId,
        },
      });

      // Run within the span's context to ensure proper nesting
      return otelContext.with(
        trace.setSpan(otelContext.active(), span),
        async () => {
          try {
            // Pass datasourceId for semantic-aware intent detection
            const result = await detectIntent(
              input.inputMessage,
              undefined,
              input.datasourceId,
            );

            endActorSpanWithEvent(
              telemetry,
              span,
              'detectIntent',
              'detectIntent',
              conversationId,
              startTime,
              true,
            );

            return result;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const errorType =
              error instanceof Error ? error.name : 'UnknownError';

            endActorSpanWithEvent(
              telemetry,
              span,
              'detectIntent',
              'detectIntent',
              conversationId,
              startTime,
              false,
              errorMessage,
              errorType,
            );

            throw error;
          }
        },
      );
    },
  );

  const summarizeIntentActor = fromPromise(
    async ({
      input,
    }: {
      input: {
        inputMessage: string;
        intent: AgentContext['intent'];
        previousMessages: UIMessage[];
        model: string;
      };
    }) => {
      const startTime = Date.now();
      const {
        provider,
        modelName,
        fullModel: _fullModel,
      } = parseModel(input.model);

      // Create span with actor attributes
      const span = telemetry.startSpan(
        'agent.actor.summarizeIntent',
        createActorAttributes(
          'summarizeIntent',
          'summarizeIntent',
          conversationId,
          input.model,
        ),
      );

      telemetry.captureEvent({
        name: AGENT_EVENTS.ACTOR_INVOKED,
        attributes: {
          'agent.actor.id': 'summarizeIntent',
          'agent.actor.type': 'summarizeIntent',
          'agent.conversation.id': conversationId,
        },
      });

      // Run within the span's context to ensure proper nesting
      return otelContext.with(
        trace.setSpan(otelContext.active(), span),
        async () => {
          try {
            const result = await summarizeIntent(
              input.inputMessage,
              input.intent,
            );

            // Capture token usage from streamText result (usage is a promise)
            // For Azure/Ollama providers, usage will be available when stream completes
            if (result.usage) {
              try {
                const usage = await result.usage;
                if (usage) {
                  // Azure uses inputTokens/outputTokens, others use promptTokens/completionTokens
                  const { promptTokens, completionTokens, totalTokens } =
                    extractTokenUsage(usage);

                  if (promptTokens > 0 || completionTokens > 0) {
                    // Add token usage as span attributes so it appears in exported data
                    span.setAttributes({
                      'agent.llm.prompt.tokens': promptTokens,
                      'agent.llm.completion.tokens': completionTokens,
                      'agent.llm.total.tokens': totalTokens,
                    });

                    // Also record as metrics (using agent-specific method for dashboard)
                    telemetry.recordAgentTokenUsage(
                      promptTokens,
                      completionTokens,
                      {
                        'agent.llm.model.name': modelName,
                        'agent.llm.provider.id': provider,
                        'agent.actor.id': 'summarizeIntent',
                        'agent.conversation.id': conversationId,
                      },
                    );
                  }
                }
              } catch {
                // Ignore errors in usage capture
              }
            }

            endActorSpanWithEvent(
              telemetry,
              span,
              'summarizeIntent',
              'summarizeIntent',
              conversationId,
              startTime,
              true,
            );

            return result;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const errorType =
              error instanceof Error ? error.name : 'UnknownError';

            endActorSpanWithEvent(
              telemetry,
              span,
              'summarizeIntent',
              'summarizeIntent',
              conversationId,
              startTime,
              false,
              errorMessage,
              errorType,
            );

            throw error;
          }
        },
      );
    },
  );

  const greetingActor = fromPromise(
    async ({
      input,
    }: {
      input: {
        inputMessage: string;
        model: string;
      };
    }) => {
      const startTime = Date.now();
      const {
        provider,
        modelName,
        fullModel: _fullModel,
      } = parseModel(input.model);

      // Create span with actor attributes
      const span = telemetry.startSpan(
        'agent.actor.greeting',
        createActorAttributes(
          'greeting',
          'greeting',
          conversationId,
          input.model,
        ),
      );

      telemetry.captureEvent({
        name: AGENT_EVENTS.ACTOR_INVOKED,
        attributes: {
          'agent.actor.id': 'greeting',
          'agent.actor.type': 'greeting',
          'agent.conversation.id': conversationId,
        },
      });

      // Run within the span's context to ensure proper nesting
      return otelContext.with(
        trace.setSpan(otelContext.active(), span),
        async () => {
          try {
            const result = await greeting(input.inputMessage, input.model);

            // Capture token usage from streamText result (usage is a promise)
            // For Azure/Ollama providers, usage will be available when stream completes
            if (result.usage) {
              try {
                const usage = await result.usage;
                if (usage) {
                  // Azure uses inputTokens/outputTokens, others use promptTokens/completionTokens
                  const { promptTokens, completionTokens, totalTokens } =
                    extractTokenUsage(usage);

                  if (promptTokens > 0 || completionTokens > 0) {
                    // Add token usage as span attributes so it appears in exported data
                    span.setAttributes({
                      'agent.llm.prompt.tokens': promptTokens,
                      'agent.llm.completion.tokens': completionTokens,
                      'agent.llm.total.tokens': totalTokens,
                    });

                    // Also record as metrics (using agent-specific method for dashboard)
                    telemetry.recordAgentTokenUsage(
                      promptTokens,
                      completionTokens,
                      {
                        'agent.llm.model.name': modelName,
                        'agent.llm.provider.id': provider,
                        'agent.actor.id': 'greeting',
                        'agent.conversation.id': conversationId,
                      },
                    );
                  }
                }
              } catch {
                // Ignore errors in usage capture
              }
            }

            endActorSpanWithEvent(
              telemetry,
              span,
              'greeting',
              'greeting',
              conversationId,
              startTime,
              true,
            );

            return result;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const errorType =
              error instanceof Error ? error.name : 'UnknownError';

            endActorSpanWithEvent(
              telemetry,
              span,
              'greeting',
              'greeting',
              conversationId,
              startTime,
              false,
              errorMessage,
              errorType,
            );

            throw error;
          }
        },
      );
    },
  );

  const readDataAgentActor = fromPromise(
    async ({
      input,
    }: {
      input: {
        inputMessage: string;
        conversationId: string;
        previousMessages: UIMessage[];
        model: string;
        repositories: Repositories;
        queryEngine: AbstractQueryEngine;
      };
    }) => {
      const startTime = Date.now();
      const {
        provider,
        modelName,
        fullModel: _fullModel,
      } = parseModel(input.model);

      // Create span with actor attributes
      const span = telemetry.startSpan(
        'agent.actor.readData',
        createActorAttributes(
          'readData',
          'readData',
          conversationId,
          input.model,
        ),
      );

      telemetry.captureEvent({
        name: AGENT_EVENTS.ACTOR_INVOKED,
        attributes: {
          'agent.actor.id': 'readData',
          'agent.actor.type': 'readData',
          'agent.conversation.id': conversationId,
        },
      });

      const parentContext = otelContext.active();
      const activeSpan = trace.getSpan(parentContext);
      if (activeSpan) {
        span.addLink({
          context: activeSpan.spanContext(),
        });
      }

      try {
        const result = await readDataAgent(
          input.conversationId,
          input.previousMessages,
          input.model,
          input.queryEngine,
          input.repositories,
        );

        if (result.usage) {
          result.usage
            .then((usage) => {
              if (usage) {
                const { promptTokens, completionTokens, totalTokens } =
                  extractTokenUsage(usage);

                if (promptTokens > 0 || completionTokens > 0) {
                  span.setAttributes({
                    'agent.llm.prompt.tokens': promptTokens,
                    'agent.llm.completion.tokens': completionTokens,
                    'agent.llm.total.tokens': totalTokens,
                  });

                  telemetry.recordAgentTokenUsage(
                    promptTokens,
                    completionTokens,
                    {
                      'agent.llm.model.name': modelName,
                      'agent.llm.provider.id': provider,
                      'agent.actor.id': 'readData',
                      'agent.conversation.id': conversationId,
                    },
                  );
                }
              }
            })
            .catch(() => {
              // Ignore errors in usage capture
            });
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorType = error instanceof Error ? error.name : 'UnknownError';

        endActorSpanWithEvent(
          telemetry,
          span,
          'readData',
          'readData',
          conversationId,
          startTime,
          false,
          errorMessage,
          errorType,
        );

        throw error;
      }
    },
  );

  const loadContextActor = fromPromise(
    async ({
      input,
    }: {
      input: {
        repositories: Repositories;
        conversationId: string;
      };
    }) => {
      const startTime = Date.now();

      // Create span with actor attributes (no model for loadContext)
      const span = telemetry.startSpan(
        'agent.actor.loadContext',
        createActorAttributes(
          'loadContext',
          'loadContext',
          conversationId,
          undefined, // No model for loadContext
        ),
      );

      if (storeLoadContextSpan) {
        storeLoadContextSpan(span);
      }

      telemetry.captureEvent({
        name: AGENT_EVENTS.ACTOR_INVOKED,
        attributes: {
          'agent.actor.id': 'loadContext',
          'agent.actor.type': 'loadContext',
          'agent.conversation.id': conversationId,
        },
      });

      // Run within the span's context to ensure proper nesting
      return otelContext.with(
        trace.setSpan(otelContext.active(), span),
        async () => {
          try {
            const result = await loadContext(
              input.repositories,
              input.conversationId,
            );
            const messages =
              MessagePersistenceService.convertToUIMessages(result);

            span.setAttributes({
              'agent.context.message_count': messages.length,
            });

            endActorSpanWithEvent(
              telemetry,
              span,
              'loadContext',
              'loadContext',
              conversationId,
              startTime,
              true,
            );

            return messages;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const errorType =
              error instanceof Error ? error.name : 'UnknownError';

            endActorSpanWithEvent(
              telemetry,
              span,
              'loadContext',
              'loadContext',
              conversationId,
              startTime,
              false,
              errorMessage,
              errorType,
            );

            throw error;
          }
        },
      );
    },
  );

  const defaultSetup = setup({
    types: {
      context: {} as AgentContext,
      events: {} as AgentEvents,
    },
    actors: {
      detectIntentActor,
      detectIntentActorCached: createCachedActor(
        detectIntentActor,
        (input: {
          inputMessage: string;
          model: string;
          datasourceId?: string;
        }) => {
          return `${input.inputMessage}::${input.model}::${input.datasourceId ?? ''}`;
        },
        30000,
      ),
      summarizeIntentActor,
      greetingActor,
      readDataAgentActor,
      loadContextActor,
      systemInfoActor,
    },
    guards: {
      // Intent-based guards (deterministic)
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      isGreeting: ({ event }: any) => event.output?.intent === 'greeting',

      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      isOther: ({ event }: any) => event.output?.intent === 'other',

      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      isReadData: ({ event }: any) => event.output?.intent === 'read-data',

      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      isSystem: ({ event }: any) => event.output?.intent === 'system',

      // Chart-related guards (deterministic - based on intent flags)
      needsChart: ({ context }) => context.intent.needsChart === true,

      needsSQL: ({ context }) => context.intent.needsSQL === true,

      // Complexity guards (deterministic)
      isSimpleQuery: ({ context }) => context.intent.complexity === 'simple',

      isComplexQuery: ({ context }) => context.intent.complexity === 'complex',

      // Message state guards (deterministic)
      hasMessages: ({ context }) => context.previousMessages.length > 0,

      hasStreamResult: ({ context }) => context.streamResult !== undefined,

      // Retry guards (deterministic)
      shouldRetry: ({ context }) => {
        const retryCount = context.retryCount || 0;
        return retryCount < 3;
      },

      retryLimitExceeded: ({ context }) => {
        const retryCount = context.retryCount || 0;
        return retryCount >= 3;
      },

      // Error state guards (deterministic)
      hasError: ({ context }) =>
        context.error !== undefined && context.error !== null,

      isRecoverableError: ({ context }) => {
        if (!context.lastError) return false;
        const message = context.lastError.message?.toLowerCase() ?? '';
        return (
          message.includes('timeout') ||
          message.includes('rate limit') ||
          message.includes('network')
        );
      },
    },
    delays: {
      retryDelay: ({ context }) => {
        const retryCount = context.retryCount || 0;
        return Math.pow(2, retryCount) * 1000;
      },
    },
  });
  return defaultSetup.createMachine({
    id: 'factory-agent',
    context: {
      model: model,
      inputMessage: '',
      conversationId: conversationId,
      conversationSlug: conversationSlug,
      response: '',
      previousMessages: [],
      streamResult: undefined,
      intent: {
        intent: 'other',
        complexity: 'simple',
        needsChart: false,
        needsSQL: false,
      },
      promptSource: undefined,
      error: undefined,
      retryCount: 0,
      lastError: undefined,
      enhancementActors: [],
    },
    initial: 'loadContext',
    states: {
      loadContext: {
        invoke: {
          src: 'loadContextActor',
          id: 'LOAD_CONTEXT',
          input: ({ context }: { context: AgentContext }) => ({
            repositories: repositories,
            conversationId: context.conversationId,
          }),
          onDone: {
            target: 'idle',
            actions: assign({
              previousMessages: ({ event }) => event.output,
              model: ({ context }) => context.model,
            }),
          },
          onError: {
            target: 'idle',
          },
        },
      },
      idle: {
        on: {
          USER_INPUT: {
            target: 'running',
            actions: assign({
              previousMessages: ({ event }) => event.messages,
              model: ({ context }) => context.model,
              inputMessage: ({ event }) => {
                const lastPart =
                  event.messages[event.messages.length - 1]?.parts[0];
                return lastPart && 'text' in lastPart ? lastPart.text : '';
              },
              streamResult: () => undefined,
              error: () => undefined,
              promptSource: ({ event }) => {
                const lastUserMessage = event.messages
                  .filter((m: UIMessage) => m.role === 'user')
                  .pop();
                const source = (
                  lastUserMessage?.metadata as { promptSource?: PromptSource }
                )?.promptSource;
                console.log(
                  '[StateMachine] Extracted promptSource from metadata:',
                  source,
                );
                return source;
              },
            }),
          },
          STOP: 'stopped',
        },
      },
      running: {
        initial: 'detectIntent',
        on: {
          USER_INPUT: {
            target: 'running',
            actions: assign({
              previousMessages: ({ event }) => event.messages,
              model: ({ context }) => context.model,
              inputMessage: ({ event }) => {
                const lastPart =
                  event.messages[event.messages.length - 1]?.parts[0];
                return lastPart && 'text' in lastPart ? lastPart.text : '';
              },
              streamResult: undefined,
              promptSource: ({ event }) => {
                const lastUserMessage = event.messages
                  .filter((m: UIMessage) => m.role === 'user')
                  .pop();
                return (
                  lastUserMessage?.metadata as { promptSource?: PromptSource }
                )?.promptSource;
              },
            }),
          },
          STOP: 'idle',
        },
        states: {
          detectIntent: {
            initial: 'attempting',
            states: {
              attempting: {
                invoke: {
                  src: 'detectIntentActorCached',
                  id: 'GET_INTENT',
                  input: ({ context }: { context: AgentContext }) => ({
                    inputMessage: context.inputMessage,
                    model: context.model,
                    datasourceId: extractDatasourceIdFromMessages(
                      context.previousMessages,
                    ),
                  }),
                  onDone: [
                    {
                      guard: 'isOther',
                      target: '#factory-agent.running.summarizeIntent',
                      actions: assign({
                        intent: ({ event }) => {
                          const intent = event.output;
                          console.log(
                            '[StateMachine] Set intent from detection:',
                            {
                              intent: intent.intent,
                              needsChart: intent.needsChart,
                              needsSQL: intent.needsSQL,
                            },
                          );
                          return intent;
                        },
                        retryCount: () => 0,
                        model: ({ context }) => context.model,
                      }),
                    },
                    {
                      guard: 'isGreeting',
                      target: '#factory-agent.running.greeting',
                      actions: assign({
                        intent: ({ event }) => {
                          const intent = event.output;
                          console.log(
                            '[StateMachine] Set intent from detection (greeting):',
                            {
                              intent: intent.intent,
                              needsChart: intent.needsChart,
                              needsSQL: intent.needsSQL,
                            },
                          );
                          return intent;
                        },
                        retryCount: () => 0,
                        model: ({ context }) => context.model,
                      }),
                    },
                    {
                      guard: 'isReadData',
                      target: '#factory-agent.running.readData',
                      actions: assign({
                        intent: ({ event }) => {
                          const intent = event.output;
                          console.log(
                            '[StateMachine] Set intent from detection (readData):',
                            {
                              intent: intent.intent,
                              needsChart: intent.needsChart,
                              needsSQL: intent.needsSQL,
                            },
                          );
                          return intent;
                        },
                        retryCount: () => 0,
                        model: ({ context }) => context.model,
                      }),
                    },
                    {
                      guard: 'isSystem',
                      target: '#factory-agent.running.systemInfo',
                      actions: assign({
                        intent: ({ event }) => {
                          const intent = event.output;
                          console.log(
                            '[StateMachine] Set intent from detection (system):',
                            {
                              intent: intent.intent,
                              needsChart: intent.needsChart,
                              needsSQL: intent.needsSQL,
                            },
                          );
                          return intent;
                        },
                        retryCount: () => 0,
                        model: ({ context }) => context.model,
                      }),
                    },
                  ],
                  onError: [
                    {
                      guard: 'shouldRetry',
                      target: 'retrying',
                      actions: assign({
                        retryCount: ({ context }) =>
                          (context.retryCount || 0) + 1,
                        lastError: ({ event }) => event.error as Error,
                        model: ({ context }) => context.model,
                      }),
                    },
                    {
                      guard: 'retryLimitExceeded',
                      target: '#factory-agent.idle',
                      actions: assign({
                        error: ({ context }) =>
                          `Intent detection failed after 3 retries: ${context.lastError?.message}`,
                        model: ({ context }) => context.model,
                      }),
                    },
                  ],
                },
                after: {
                  30000: {
                    target: 'retrying',
                    guard: 'shouldRetry',
                    actions: assign({
                      retryCount: ({ context }) =>
                        (context.retryCount || 0) + 1,
                      error: () => 'Intent detection timeout',
                      model: ({ context }) => context.model,
                    }),
                  },
                },
              },
              retrying: {
                after: {
                  retryDelay: {
                    target: 'attempting',
                  },
                },
              },
            },
          },
          summarizeIntent: {
            invoke: {
              src: 'summarizeIntentActor',
              id: 'SUMMARIZE_INTENT',
              input: ({ context }: { context: AgentContext }) => ({
                inputMessage: context.inputMessage,
                intent: context.intent,
                previousMessages: context.previousMessages,
                model: context.model,
              }),
              onDone: {
                target: 'streaming',
                actions: assign({
                  streamResult: ({ event }) => event.output,
                  model: ({ context }) => context.model,
                }),
              },
              onError: {
                target: '#factory-agent.idle',
                actions: assign({
                  error: ({ event }) => {
                    const errorMsg =
                      event.error instanceof Error
                        ? event.error.message
                        : String(event.error);
                    console.error(
                      'summarizeIntent error:',
                      errorMsg,
                      event.error,
                    );
                    return errorMsg;
                  },
                  streamResult: undefined,
                  model: ({ context }) => context.model,
                }),
              },
            },
          },
          greeting: {
            invoke: {
              src: 'greetingActor',
              id: 'SALUE',
              input: ({ context }: { context: AgentContext }) => ({
                inputMessage: context.inputMessage,
                model: context.model,
              }),
              onDone: {
                target: 'streaming',
                actions: assign({
                  streamResult: ({ event }) => event.output,
                  model: ({ context }) => context.model,
                }),
              },
              onError: {
                target: '#factory-agent.idle',
                actions: assign({
                  error: ({ event }) => {
                    const errorMsg =
                      event.error instanceof Error
                        ? event.error.message
                        : String(event.error);
                    console.error('greeting error:', errorMsg, event.error);
                    return errorMsg;
                  },
                  streamResult: undefined,
                  model: ({ context }) => context.model,
                }),
              },
            },
          },
          readData: {
            type: 'parallel',
            states: {
              processRequest: {
                initial: 'invoking',
                states: {
                  invoking: {
                    invoke: {
                      src: 'readDataAgentActor',
                      id: 'READ_DATA',
                      input: ({ context }: { context: AgentContext }) => {
                        console.log(
                          '[StateMachine] Passing to readDataAgentActor:',
                          {
                            promptSource: context.promptSource,
                            intentNeedsSQL: context.intent.needsSQL,
                          },
                        );
                        return {
                          inputMessage: context.inputMessage,
                          conversationId: context.conversationSlug,
                          previousMessages: context.previousMessages,
                          model: context.model,
                          repositories: repositories,
                          queryEngine: queryEngine,
                          promptSource: context.promptSource,
                          intent: context.intent,
                        };
                      },
                      onDone: {
                        target: 'completed',
                        actions: assign({
                          streamResult: ({ event }) => event.output,
                          retryCount: () => 0,
                          model: ({ context }) => context.model,
                        }),
                      },
                      onError: [
                        {
                          guard: 'shouldRetry',
                          target: 'retrying',
                          actions: assign({
                            retryCount: ({ context }) =>
                              (context.retryCount || 0) + 1,
                            lastError: ({ event }) => event.error as Error,
                            model: ({ context }) => context.model,
                          }),
                        },
                        {
                          target: 'failed',
                          actions: assign({
                            error: ({ event }) => {
                              const errorMsg =
                                event.error instanceof Error
                                  ? event.error.message
                                  : String(event.error);
                              console.error(
                                'readData error:',
                                errorMsg,
                                event.error,
                              );
                              return errorMsg;
                            },
                            streamResult: undefined,
                            model: ({ context }) => context.model,
                          }),
                        },
                      ],
                    },
                    after: {
                      120000: {
                        target: 'failed',
                        actions: assign({
                          error: () => 'ReadData timeout after 120 seconds',
                          model: ({ context }) => context.model,
                        }),
                      },
                    },
                  },
                  retrying: {
                    after: {
                      retryDelay: {
                        target: 'invoking',
                      },
                    },
                  },
                  completed: {
                    type: 'final',
                  },
                  failed: {
                    type: 'final',
                  },
                },
              },
              // Background enhancement (runs in parallel)
              backgroundEnhancement: {
                initial: 'idle',
                states: {
                  idle: {
                    type: 'final',
                  },
                },
              },
            },
            onDone: {
              target: 'streaming',
            },
          },
          systemInfo: {
            invoke: {
              src: 'systemInfoActor',
              id: 'SYSTEM_INFO',
              input: ({ context }: { context: AgentContext }) => ({
                inputMessage: context.inputMessage,
              }),
              onDone: {
                target: 'streaming',
                actions: assign({
                  streamResult: ({ event }) => event.output,
                  model: ({ context }) => context.model,
                }),
              },
              onError: {
                target: '#factory-agent.idle',
                actions: assign({
                  error: ({ event }) => {
                    const errorMsg =
                      event.error instanceof Error
                        ? event.error.message
                        : String(event.error);
                    console.error('systemInfo error:', errorMsg, event.error);
                    return errorMsg;
                  },
                  streamResult: undefined,
                  model: ({ context }) => context.model,
                }),
              },
            },
          },
          streaming: {
            on: {
              FINISH_STREAM: {
                target: '#factory-agent.idle',
              },
            },
          },
        },
      },
      stopped: {
        type: 'final',
      },
    },
  });
};
