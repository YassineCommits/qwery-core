import type { Span } from '@opentelemetry/api';
import type { TelemetryManager } from '@qwery/telemetry/otel';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelInfo {
  provider: string;
  modelName: string;
  fullModel: string;
}

/**
 * Extract token usage from various provider formats
 */
export function extractTokenUsage(usage: unknown): TokenUsage {
  if (!usage || typeof usage !== 'object') {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  const usageObj = usage as Record<string, unknown>;

  const promptTokens =
    (typeof usageObj.inputTokens === 'number' ? usageObj.inputTokens : 0) ||
    (typeof usageObj.promptTokens === 'number' ? usageObj.promptTokens : 0) ||
    (typeof usageObj.prompt_tokens === 'number' ? usageObj.prompt_tokens : 0) ||
    0;

  const completionTokens =
    (typeof usageObj.outputTokens === 'number' ? usageObj.outputTokens : 0) ||
    (typeof usageObj.completionTokens === 'number'
      ? usageObj.completionTokens
      : 0) ||
    (typeof usageObj.completion_tokens === 'number'
      ? usageObj.completion_tokens
      : 0) ||
    0;

  const totalTokens =
    (typeof usageObj.totalTokens === 'number' ? usageObj.totalTokens : 0) ||
    (typeof usageObj.total_tokens === 'number' ? usageObj.total_tokens : 0) ||
    promptTokens + completionTokens;

  return { promptTokens, completionTokens, totalTokens };
}

/**
 * Parse model string into provider/name components
 */
export function parseModel(model: string): ModelInfo {
  const parts = model.split('/');
  if (parts.length === 2) {
    return {
      provider: parts[0]!,
      modelName: parts[1]!,
      fullModel: model,
    };
  }
  return {
    provider: 'azure',
    modelName: model,
    fullModel: model,
  };
}

/**
 * Helper to record token usage from stream results
 */
export async function recordStreamTokenUsage(
  result: { usage?: Promise<unknown> } | unknown,
  span: Span,
  telemetry: TelemetryManager,
  modelInfo: ModelInfo,
  actorId: string,
  conversationId: string,
): Promise<void> {
  if (!result || typeof result !== 'object') return;

  const streamResult = result as { usage?: Promise<unknown> };
  if (!streamResult.usage) return;

  try {
    const usage = await streamResult.usage;
    if (!usage) return;

    const { promptTokens, completionTokens, totalTokens } =
      extractTokenUsage(usage);

    if (promptTokens > 0 || completionTokens > 0) {
      span.setAttributes({
        'agent.llm.prompt.tokens': promptTokens,
        'agent.llm.completion.tokens': completionTokens,
        'agent.llm.total.tokens': totalTokens,
      });

      telemetry.recordAgentTokenUsage(promptTokens, completionTokens, {
        'agent.llm.model.name': modelInfo.modelName,
        'agent.llm.provider.id': modelInfo.provider,
        'agent.actor.id': actorId,
        'agent.conversation.id': conversationId,
      });
    }
  } catch {
    // Ignore errors in usage capture
  }
}
