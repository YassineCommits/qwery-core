import type { SemanticModel, LearningEvent } from '@qwery/domain/entities';

/**
 * Semantic Learning Service
 * Provides adaptive ontology improvement based on user interactions
 * Tracks successful/failed queries and adjusts the semantic model accordingly
 */
export class SemanticLearningService {
  private maxLearningEvents = 100;

  /**
   * Learn from a successful query execution
   * Boosts confidence in entities/metrics used and extracts patterns
   */
  learnFromSuccess(
    model: SemanticModel,
    userQuery: string,
    sql: string,
    entities: string[] = [],
  ): void {
    const event: LearningEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type: 'query_success',
      context: {
        userQuery,
        generatedSQL: sql,
        entities,
      },
      impact: {
        confidenceAdjusted: entities.map((entityId) => ({
          elementId: entityId,
          delta: 0.05,
        })),
      },
    };

    this.addLearningEvent(model, event);

    // Boost confidence for entities that were successfully used
    for (const entityId of entities) {
      const entity = model.entityClasses.get(entityId);
      if (entity) {
        entity.confidence = Math.min(1.0, entity.confidence + 0.05);
      }
    }

    // Extract and learn synonyms from user query
    this.extractSynonyms(model, userQuery, entities);

    model.updatedAt = new Date();
  }

  /**
   * Learn from a query failure
   * Reduces confidence and stores the failure pattern for CRAG improvement
   */
  learnFromFailure(
    model: SemanticModel,
    userQuery: string,
    sql: string,
    errorMessage: string,
    entities: string[] = [],
  ): void {
    const event: LearningEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type: 'query_failure',
      context: {
        userQuery,
        generatedSQL: sql,
        errorMessage,
        entities,
      },
      impact: {
        confidenceAdjusted: entities.map((entityId) => ({
          elementId: entityId,
          delta: -0.02,
        })),
      },
    };

    this.addLearningEvent(model, event);

    // Slightly reduce confidence for entities involved in failure
    for (const entityId of entities) {
      const entity = model.entityClasses.get(entityId);
      if (entity) {
        entity.confidence = Math.max(0.1, entity.confidence - 0.02);
      }
    }

    model.updatedAt = new Date();
  }

  /**
   * Learn a synonym from user's natural language usage
   */
  learnSynonym(
    model: SemanticModel,
    userTerm: string,
    matchedEntity: string,
  ): void {
    const normalizedTerm = userTerm.toLowerCase().trim();
    const existingSynonyms = model.synonyms.get(matchedEntity) ?? [];

    if (!existingSynonyms.includes(normalizedTerm)) {
      existingSynonyms.push(normalizedTerm);
      model.synonyms.set(matchedEntity, existingSynonyms);

      const event: LearningEvent = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        type: 'synonym_learned',
        context: {
          userQuery: userTerm,
          entities: [matchedEntity],
        },
        impact: {
          synonymsAdded: [normalizedTerm],
        },
      };

      this.addLearningEvent(model, event);
      model.updatedAt = new Date();
    }
  }

  /**
   * Record a user correction (when user explicitly corrects agent output)
   */
  recordCorrection(
    model: SemanticModel,
    originalSQL: string,
    correctedSQL: string,
    userQuery: string,
  ): void {
    const event: LearningEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type: 'user_correction',
      context: {
        userQuery,
        generatedSQL: originalSQL,
        correction: correctedSQL,
      },
      impact: {},
    };

    this.addLearningEvent(model, event);
    model.updatedAt = new Date();
  }

  /**
   * Boost confidence for a metric when user confirms result is correct
   */
  reinforceMetric(model: SemanticModel, metricId: string): void {
    const metric = model.metrics.get(metricId);
    if (metric) {
      metric.confidence = Math.min(1.0, (metric.confidence ?? 1.0) + 0.1);
      model.updatedAt = new Date();
    }
  }

  /**
   * Reduce confidence for a metric when user rejects result
   */
  penalizeMetric(model: SemanticModel, metricId: string): void {
    const metric = model.metrics.get(metricId);
    if (metric) {
      metric.confidence = Math.max(0.1, (metric.confidence ?? 1.0) - 0.1);
      model.updatedAt = new Date();
    }
  }

  /**
   * Get successful query patterns for a given user intent
   * Used by RAG to boost retrieval of proven patterns
   */
  getSuccessfulPatterns(model: SemanticModel, limit = 10): LearningEvent[] {
    return model.learningEvents
      .filter((e) => e.type === 'query_success')
      .slice(-limit);
  }

  /**
   * Get failure patterns to avoid repeating mistakes
   */
  getFailurePatterns(model: SemanticModel, limit = 10): LearningEvent[] {
    return model.learningEvents
      .filter((e) => e.type === 'query_failure')
      .slice(-limit);
  }

  /**
   * Extract potential synonyms from user query based on matched entities
   */
  private extractSynonyms(
    model: SemanticModel,
    userQuery: string,
    entities: string[],
  ): void {
    const words = userQuery.toLowerCase().split(/\s+/);

    for (const entityId of entities) {
      const entity = model.entityClasses.get(entityId);
      if (!entity) continue;

      const entityNameLower = entity.name.toLowerCase();
      const entityWords = entityNameLower.split(/[_\s-]+/);

      // Check if any user words are potential synonyms
      for (const word of words) {
        if (word.length < 3) continue;
        if (entityWords.includes(word)) continue;

        // Simple heuristic: if word appears near entity name context, might be synonym
        const existingSynonyms = model.synonyms.get(entityId) ?? [];
        if (
          !existingSynonyms.includes(word) &&
          !entityWords.some((ew) => ew.includes(word) || word.includes(ew))
        ) {
          // Only add if word seems semantically related (future: use embeddings)
          // For now, skip automatic synonym detection - only learn explicit ones
        }
      }
    }
  }

  /**
   * Add a learning event, maintaining max size
   */
  private addLearningEvent(model: SemanticModel, event: LearningEvent): void {
    model.learningEvents.push(event);

    // Trim old events if exceeding max
    if (model.learningEvents.length > this.maxLearningEvents) {
      model.learningEvents = model.learningEvents.slice(
        -this.maxLearningEvents,
      );
    }
  }
}

export const semanticLearningService = new SemanticLearningService();
