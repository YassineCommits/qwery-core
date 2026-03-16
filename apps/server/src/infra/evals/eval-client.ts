import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '@qwery/shared/logger';
import {
  TracingHttpClient,
  type Trace,
  type TraceStatus,
} from '@qwery/tracing-sdk';

const DEFAULT_SAMPLING_RATE = 0.3;
const REQUEST_TIMEOUT_MS = 2000;

export type ToolCallSummary = {
  tool_name: string;
  toolCallId?: string;
  args?: unknown;
  latency_ms?: number;
  is_error?: boolean;
  result_summary?: string;
  error?: string;
};

export type Interaction = {
  event_id?: string;
  timestamp?: string;
  tenant_id?: string | null;
  app: string;
  env: string;
  agent_name: string;
  agent_version: string;
  model_name: string;
  model_version?: string | null;
  task_type: string;
  session_id?: string | null;
  turn_index?: number | null;

  user_message?: string;
  assistant_message?: string;
  latency_ms?: number;
  tools_used?: string[];
  tool_calls?: ToolCallSummary[];
  labels?: {
    customer_tier?: string;
    feature_flags?: string[];
    scenario_id?: string;
  };
  tokens_prompt?: number;
  tokens_completion?: number;
  tokens_total?: number;
  schema_version?: string;
  redaction_version?: string;
  sampled?: boolean;
};

export type EvalToolCallSummary = {
  tool_name: string;
  arguments: unknown;
  result_summary?: string;
  error?: string;
};

export type EvalInteractionPayload = {
  user_message: string;
  assistant_message: string;
  tool_calls: EvalToolCallSummary[];
  duration_ms?: number;
  traceId?: string;
  conversationSlug?: string | null;
};

function getSamplingRate(): number {
  const raw = process.env.EVALS_SAMPLING_RATE;
  if (!raw) return DEFAULT_SAMPLING_RATE;

  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) return DEFAULT_SAMPLING_RATE;

  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

export async function sendInteractions(events: Interaction[]): Promise<void> {
  if (!events.length) return;

  const baseUrl =
    process.env.EVALS_BASE_URL ??
    process.env.TRACING_BASE_URL ??
    (process.env.NODE_ENV === 'development'
      ? 'http://localhost:4097'
      : undefined);
  const apiKey = process.env.EVALS_API_KEY ?? process.env.TRACING_API_KEY;

  if (!baseUrl) return;

  const samplingRate = getSamplingRate();
  const sampled = Math.random() < samplingRate;
  if (!sampled) return;

  const url = `${baseUrl.replace(/\/+$/, '')}/interactions/ingest-interactions`;
  const logger = await getLogger();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const nowIso = new Date().toISOString();

  const payload = {
    events: events.map((event) => ({
      event_id: event.event_id ?? uuidv4(),
      timestamp: event.timestamp ?? nowIso,
      schema_version: event.schema_version ?? 'v1',
      redaction_version: event.redaction_version ?? 'v1',
      ...event,
      sampled: true,
    })),
  };

  logger.debug(
    {
      baseUrl,
      url,
      eventCount: events.length,
      samplingRate,
      sampled,
      firstEventId: payload.events[0]?.event_id,
    },
    '[Evals] Sending interactions request',
  );

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      logger.warn(
        {
          status: response.status,
          url,
          body: text,
        },
        '[Evals] Failed to send interactions',
      );
    }
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        url,
      },
      '[Evals] Error while sending interactions',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function getTracingClient(): TracingHttpClient | null {
  const baseUrl = process.env.TRACING_BASE_URL;
  const apiKey = process.env.TRACING_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return new TracingHttpClient(baseUrl, apiKey);
}

async function fetchCompletedTrace(
  traceId: string,
  maxAttempts = 10,
  delayMs = 200,
): Promise<Trace | null> {
  const client = getTracingClient();
  if (!client) return null;

  let lastTrace: Trace | null = null;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const trace = await client.getTrace(traceId);
      lastTrace = trace;
      const status = trace.status as TraceStatus;
      if (status === 'completed' || status === 'failed') {
        return trace;
      }
    } catch {
      break;
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return lastTrace;
}

function extractTextFromMessageLike(input: unknown, maxLength = 4000): string {
  if (!input) return '';
  if (typeof input === 'string') {
    return input.length > maxLength ? `${input.slice(0, maxLength)}…` : input;
  }

  if (
    typeof input === 'object' &&
    input !== null &&
    'content' in input &&
    typeof (input as { content?: unknown }).content === 'object'
  ) {
    const content = (input as { content?: unknown }).content as {
      parts?: Array<{ type?: string; text?: string }>;
    } | null;
    const parts = content?.parts;
    if (Array.isArray(parts)) {
      const text = parts
        .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text as string)
        .join(' ')
        .trim();
      if (text) {
        return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
      }
    }
  }

  try {
    const serialized = JSON.stringify(input);
    return serialized.length > maxLength
      ? `${serialized.slice(0, maxLength)}…`
      : serialized;
  } catch {
    return '[unserializable]';
  }
}

function summarizeToolOutput(output: unknown, maxLength = 400): string {
  if (output === null || output === undefined) return '';
  if (typeof output === 'string') {
    return output.length > maxLength
      ? `${output.slice(0, maxLength)}…`
      : output;
  }

  try {
    const serialized = JSON.stringify(output);
    if (!serialized) return '';
    return serialized.length > maxLength
      ? `${serialized.slice(0, maxLength)}…`
      : serialized;
  } catch {
    return '[non-serializable output]';
  }
}

function extractEvalPayloadFromTrace(
  trace: Trace,
): EvalInteractionPayload | null {
  const userMessage =
    typeof trace.input === 'string'
      ? trace.input
      : extractTextFromMessageLike(trace.input);

  const customSteps = trace.steps.filter((s) => s.type === 'custom');

  let assistantCandidate: unknown | null = null;

  for (let i = customSteps.length - 1; i >= 0; i -= 1) {
    const step = customSteps[i];
    if (!step) continue;
    if (
      typeof step.name === 'string' &&
      step.name.startsWith('final_answer:')
    ) {
      assistantCandidate = step.output;
      break;
    }
  }

  if (!assistantCandidate) {
    for (let i = customSteps.length - 1; i >= 0; i -= 1) {
      const step = customSteps[i];
      if (!step) continue;
      if (step.name !== 'messages') continue;
      const direction = step.metadata?.direction;
      if (direction === 'out') {
        assistantCandidate = step.output;
        break;
      }
    }
  }

  const assistantMessage = assistantCandidate
    ? extractTextFromMessageLike(assistantCandidate)
    : '';

  if (!assistantMessage) {
    return null;
  }

  const toolSteps = trace.steps.filter((s) => s.type === 'tool_call');

  const toolCalls: EvalToolCallSummary[] = toolSteps.map((toolStep) => {
    const resultSummary = toolStep.error
      ? `error: ${toolStep.error.slice(0, 160)}`
      : summarizeToolOutput(toolStep.output);

    return {
      tool_name: toolStep.name,
      arguments: toolStep.input,
      result_summary: resultSummary || undefined,
      error: toolStep.error ?? undefined,
    };
  });

  let durationMs = trace.totalLatencyMs;
  if (!durationMs && trace.startedAt && trace.endedAt) {
    const start = new Date(trace.startedAt).getTime();
    const end = new Date(trace.endedAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      durationMs = end - start;
    }
  }

  const conversationSlug =
    typeof trace.metadata?.conversationSlug === 'string'
      ? (trace.metadata.conversationSlug as string)
      : null;

  return {
    user_message: userMessage,
    assistant_message: assistantMessage,
    tool_calls: toolCalls,
    duration_ms: durationMs || undefined,
    traceId: trace.id,
    conversationSlug,
  };
}

function mapEvalPayloadToInteraction(
  payload: EvalInteractionPayload,
  options: {
    app: string;
    env: string;
    sessionId: string;
    turnIndex: number;
    agentName: string;
    agentVersion: string;
    modelName: string;
    taskType: string;
  },
): Interaction {
  const toolCalls: ToolCallSummary[] = payload.tool_calls.map((tc) => ({
    tool_name: tc.tool_name,
    args: tc.arguments,
    result_summary: tc.result_summary,
    error: tc.error,
  }));

  return {
    event_id: uuidv4(),
    timestamp: new Date().toISOString(),
    app: options.app,
    env: options.env,
    session_id: options.sessionId,
    turn_index: options.turnIndex,
    agent_name: options.agentName,
    agent_version: options.agentVersion,
    model_name: options.modelName,
    task_type: options.taskType,
    user_message: payload.user_message,
    assistant_message: payload.assistant_message,
    tool_calls: toolCalls,
    latency_ms: payload.duration_ms,
    sampled: true,
  };
}

export async function buildInteractionFromTraceAndSend(options: {
  traceId: string;
  app: string;
  env: string;
  sessionId: string;
  turnIndex: number;
  agentName: string;
  agentVersion: string;
  modelName: string;
  taskType: string;
}): Promise<void> {
  const logger = await getLogger();

  try {
    const trace = await fetchCompletedTrace(options.traceId);
    if (!trace) {
      logger.warn(
        { traceId: options.traceId },
        '[Evals] Trace not found when building interaction',
      );
      return;
    }

    const payload = extractEvalPayloadFromTrace(trace);
    if (!payload) {
      const customSteps = trace.steps.filter((s) => s.type === 'custom');
      const toolSteps = trace.steps.filter((s) => s.type === 'tool_call');
      const hasFinalAnswerStep = customSteps.some(
        (s) => typeof s.name === 'string' && s.name.startsWith('final_answer:'),
      );
      const outMessageSteps = customSteps.filter(
        (s) => s.name === 'messages' && s.metadata?.direction === 'out',
      );
      const lastCustomStepNames = customSteps
        .slice(-5)
        .map((s) => s.name)
        .filter((name) => typeof name === 'string') as string[];

      const outMessagesSummary = outMessageSteps.slice(-2).map((s) => {
        const output = s.output as unknown;
        const hasOutput = output !== null && output !== undefined;
        const hasContentParts =
          typeof output === 'object' &&
          output !== null &&
          'content' in (output as { content?: unknown }) &&
          Array.isArray(
            (output as { content?: { parts?: unknown[] } }).content?.parts,
          );
        return {
          name: s.name,
          hasOutput,
          hasContentParts,
        };
      });

      logger.debug(
        {
          traceId: trace.id,
          status: trace.status,
          totalSteps: trace.steps.length,
          customStepCount: customSteps.length,
          toolCallStepCount: toolSteps.length,
          hasFinalAnswerStep,
          outMessagesStepCount: outMessageSteps.length,
          lastCustomStepNames,
          outMessagesSummary,
        },
        '[Evals] Skipping interaction, no assistant message found in trace',
      );
      return;
    }

    const interaction = mapEvalPayloadToInteraction(payload, options);

    logger.debug(
      {
        event_id: interaction.event_id,
        task_type: interaction.task_type,
        env: interaction.env,
        userMessageLength: interaction.user_message?.length ?? 0,
        assistantMessageLength: interaction.assistant_message?.length ?? 0,
        toolCallCount: interaction.tool_calls?.length ?? 0,
        userPreview: interaction.user_message?.slice(0, 120),
        assistantPreview: interaction.assistant_message?.slice(0, 120),
      },
      '[Evals] Prepared interaction from trace',
    );

    await sendInteractions([interaction]);
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        traceId: options.traceId,
      },
      '[Evals] Failed to build/send interaction from trace',
    );
  }
}
