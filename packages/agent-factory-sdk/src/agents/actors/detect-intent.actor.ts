import { generateObject } from 'ai';
import { z } from 'zod';
import { fromPromise } from 'xstate/actors';
import type { UIMessage } from 'ai';
import { INTENTS_LIST, IntentSchema, type Intent } from '../types';
import { DETECT_INTENT_PROMPT } from '../prompts/detect-intent.prompt';
import { resolveModel, getDefaultModel } from '../../services/model-resolver';
import { semanticModelService } from '../../services/semantic';

interface KeywordPattern {
  pattern: RegExp;
  intent: Intent['intent'];
  needsChart?: boolean;
  needsSQL?: boolean;
  complexity?: Intent['complexity'];
}

const KEYWORD_PATTERNS: KeywordPattern[] = [
  // Greeting patterns - high confidence, no SQL needed
  {
    pattern: /^(hi|hello|hey|good\s*(morning|afternoon|evening)|greetings)\b/i,
    intent: 'greeting',
    needsChart: false,
    needsSQL: false,
    complexity: 'simple',
  },
  {
    pattern: /^(thanks|thank\s*you|thx)\b/i,
    intent: 'greeting',
    needsChart: false,
    needsSQL: false,
    complexity: 'simple',
  },

  // System info patterns
  {
    pattern:
      /^(what\s*(can\s*you|are\s*you)|who\s*are\s*you|help|how\s*do\s*you\s*work)/i,
    intent: 'system',
    needsChart: false,
    needsSQL: false,
    complexity: 'simple',
  },

  // Chart/visualization patterns - need SQL + chart
  {
    pattern:
      /\b(chart|graph|plot|visualize|visualization|pie\s*chart|bar\s*chart|line\s*chart)\b/i,
    intent: 'read-data',
    needsChart: true,
    needsSQL: true,
    complexity: 'medium',
  },

  // Data query patterns - need SQL
  {
    pattern:
      /^(show|display|list|get|find|fetch|select|query|give\s*me|tell\s*me)\s+(me\s+)?(all|the|my)?\s*/i,
    intent: 'read-data',
    needsChart: false,
    needsSQL: true,
    complexity: 'simple',
  },
  {
    pattern:
      /\b(how\s*many|count|total|sum|average|avg|min|max|top\s*\d+|bottom\s*\d+)\b/i,
    intent: 'read-data',
    needsChart: false,
    needsSQL: true,
    complexity: 'medium',
  },
  {
    pattern:
      /\b(group\s*by|order\s*by|sort\s*by|filter|where|between|greater|less\s*than)\b/i,
    intent: 'read-data',
    needsChart: false,
    needsSQL: true,
    complexity: 'medium',
  },
  {
    pattern: /\b(join|merge|combine|compare)\s+(the\s+)?(data|tables?)\b/i,
    intent: 'read-data',
    needsChart: false,
    needsSQL: true,
    complexity: 'complex',
  },

  // Data inquiry patterns - questions about the data
  {
    pattern:
      /\b(is\s+there|are\s+there|do\s+we\s+have|does\s+the\s+data|how\s+much|what\s+is\s+the)\b/i,
    intent: 'read-data',
    needsChart: false,
    needsSQL: true,
    complexity: 'simple',
  },
  {
    pattern: /\b(a\s+lot\s+of|many|few|any|some|most|least)\b.*\?$/i,
    intent: 'read-data',
    needsChart: false,
    needsSQL: true,
    complexity: 'simple',
  },
  {
    pattern: /\b(which|what|where|when|why)\b.*\b(data|records?|rows?|values?)\b/i,
    intent: 'read-data',
    needsChart: false,
    needsSQL: true,
    complexity: 'medium',
  },
];

/**
 * Fast keyword-based intent detection
 * Returns null if no confident match, allowing LLM fallback
 */
function detectIntentFromKeywords(text: string): Intent | null {
  const normalizedText = text.trim().toLowerCase();

  // Skip keyword detection for very short or very long queries
  if (normalizedText.length < 2 || normalizedText.length > 500) {
    return null;
  }

  for (const {
    pattern,
    intent,
    needsChart,
    needsSQL,
    complexity,
  } of KEYWORD_PATTERNS) {
    if (pattern.test(text)) {
      console.log(
        `[detectIntent] Keyword match: "${pattern.source}" → ${intent}`,
      );
      return {
        intent,
        needsChart: needsChart ?? false,
        needsSQL: needsSQL ?? false,
        complexity: complexity ?? 'simple',
      };
    }
  }

  return null;
}

interface SemanticMatch {
  boost: boolean;
  matchedTerms: string[];
  needsSQL: boolean;
}

/**
 * Semantic-aware intent detection using cached semantic model vocabulary
 * Checks if user query mentions known entities, metrics, or vocabulary terms
 * Also checks learning events for previously discussed topics
 */
function detectIntentFromSemanticModel(
  text: string,
  datasourceId?: string,
): SemanticMatch {
  if (!datasourceId) {
    return { boost: false, matchedTerms: [], needsSQL: false };
  }

  const model = semanticModelService.getCached(datasourceId);
  if (!model) {
    return { boost: false, matchedTerms: [], needsSQL: false };
  }

  const textLower = text.toLowerCase();
  const textWords = textLower.split(/\s+/);
  const matchedTerms: string[] = [];

  // Check entity names (tables) - both exact and partial
  for (const entity of model.entityClasses.values()) {
    const entityNameLower = entity.name.toLowerCase();
    const entityWords = entityNameLower.split(/[_\s-]+/);
    if (
      textLower.includes(entityNameLower) ||
      entityWords.some((w) => w.length > 3 && textWords.includes(w))
    ) {
      matchedTerms.push(`entity:${entity.name}`);
    }
  }

  // Check metric names
  for (const metric of model.metrics.values()) {
    const metricNameLower = metric.name.toLowerCase();
    if (textLower.includes(metricNameLower)) {
      matchedTerms.push(`metric:${metric.name}`);
    }
  }

  // Check dimension names - also check column names for partial word matches
  // This dynamically extracts searchable terms from any column name (any language)
  for (const dimension of model.dimensions.values()) {
    const dimNameLower = dimension.name.toLowerCase();
    // Split on common separators: spaces, underscores, hyphens, parentheses, slashes
    const dimWords = dimNameLower.split(/[\s_\-()/]+/).filter((w) => w.length > 2);

    // Check if any word from the dimension name appears in the user's query
    if (
      textLower.includes(dimNameLower) ||
      dimWords.some((w) => textWords.some((tw) => tw.includes(w) || w.includes(tw)))
    ) {
      matchedTerms.push(`dimension:${dimension.name}`);
    }
  }

  // Check synonyms/vocabulary from the semantic model
  for (const [term, synonyms] of model.synonyms.entries()) {
    if (
      textLower.includes(term) ||
      synonyms.some((s) => textLower.includes(s.toLowerCase()))
    ) {
      matchedTerms.push(`vocab:${term}`);
    }
  }

  // Check learning events for previously discussed topics
  const recentSuccess = model.learningEvents
    .filter((e) => e.type === 'query_success')
    .slice(-5);
  for (const event of recentSuccess) {
    const eventEntities = event.context.entities ?? [];
    for (const entity of eventEntities) {
      const entityLower = entity.toLowerCase();
      if (textLower.includes(entityLower)) {
        matchedTerms.push(`learned:${entity}`);
      }
    }
  }

  const hasMatch = matchedTerms.length > 0;
  if (hasMatch) {
    console.log(
      `[detectIntent] Semantic match: ${matchedTerms.join(', ')} → boost read-data`,
    );
  }

  return {
    boost: hasMatch,
    matchedTerms,
    needsSQL: hasMatch,
  };
}

/**
 * LLM-based intent detection (fallback)
 */
async function detectIntentWithLLM(
  text: string,
  previousMessages?: UIMessage[],
): Promise<Intent> {
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('generateObject timeout after 30 seconds')),
          30000,
        );
      });

      const generatePromise = generateObject({
        model: await resolveModel(getDefaultModel()),
        schema: IntentSchema,
        prompt: DETECT_INTENT_PROMPT(text, previousMessages),
      });

      const result = await Promise.race([generatePromise, timeoutPromise]);

      const intentObject = result.object;
      const matchedIntent = INTENTS_LIST.find(
        (intent) => intent.name === intentObject.intent,
      );

      if (!matchedIntent || matchedIntent.supported === false) {
        return {
          intent: 'other' as const,
          complexity: intentObject.complexity,
          needsChart: intentObject.needsChart ?? false,
          needsSQL: intentObject.needsSQL ?? false,
        };
      }

      return intentObject;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.stack) {
        console.error('[detectIntent] Stack:', error.stack);
      }

      if (attempt === maxAttempts) {
        break;
      }
    }
  }

  console.error(
    '[detectIntent] All LLM attempts failed, falling back to other intent:',
    lastError instanceof Error ? lastError.message : String(lastError),
  );

  return {
    intent: 'other' as const,
    complexity: 'simple' as const,
    needsChart: false,
    needsSQL: false,
  };
}

/**
 * Hybrid intent detection: semantic → keywords → LLM fallback
 * Uses cached semantic model for vocabulary-aware detection
 */
export const detectIntent = async (
  text: string,
  previousMessages?: UIMessage[],
  datasourceId?: string,
): Promise<Intent> => {
  // Fast path 1: Semantic model vocabulary matching
  const semanticMatch = detectIntentFromSemanticModel(text, datasourceId);
  if (semanticMatch.boost) {
    // If semantic model matches, we know it's a data query
    return {
      intent: 'read-data',
      needsChart: false,
      needsSQL: true,
      complexity: 'medium',
    };
  }

  // Fast path 2: Keyword-based detection
  const keywordResult = detectIntentFromKeywords(text);
  if (keywordResult) {
    return keywordResult;
  }

  // Slow path: LLM-based detection
  return detectIntentWithLLM(text, previousMessages);
};

export const detectIntentActor = fromPromise(
  async ({
    input,
  }: {
    input: {
      inputMessage: string;
      model: string;
      previousMessages?: UIMessage[];
      datasourceId?: string;
    };
  }): Promise<z.infer<typeof IntentSchema>> => {
    try {
      const intent = await detectIntent(
        input.inputMessage,
        input.previousMessages,
        input.datasourceId,
      );
      return intent;
    } catch (error) {
      console.error('[detectIntentActor] ERROR:', error);
      throw error;
    }
  },
);
