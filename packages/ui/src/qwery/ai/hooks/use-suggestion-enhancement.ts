import { useEffect, useRef } from 'react';
import type { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { createSuggestionButton, generateSuggestionId, cleanSuggestionPatterns, scrollToConversationBottom } from '../utils/suggestion-enhancement';
import type { DetectedSuggestion } from './use-suggestion-detection';

export interface UseSuggestionEnhancementOptions {
  detectedSuggestions: DetectedSuggestion[];
  containerRef: React.RefObject<HTMLElement | null>;
  sendMessage?: ReturnType<typeof useChat>['sendMessage'];
  contextMessages: {
    lastUserQuestion?: string;
    lastAssistantResponse?: string;
  };
}

export function useSuggestionEnhancement({
  detectedSuggestions,
  containerRef,
  sendMessage,
  contextMessages,
}: UseSuggestionEnhancementOptions): void {
  const processedElementsRef = useRef<Set<Element>>(new Set());

  useEffect(() => {
    if (!containerRef.current || !sendMessage || detectedSuggestions.length === 0) {
      return;
    }

    const container = containerRef.current;
    const cleanupFunctions: Array<() => void> = [];

    try {
      cleanSuggestionPatterns(container);

      detectedSuggestions.forEach(({ element, suggestionText }) => {
        if (element.querySelector('[data-suggestion-button]') || processedElementsRef.current.has(element)) {
          return;
        }

        processedElementsRef.current.add(element);
        const suggestionId = generateSuggestionId(suggestionText);
        
        const { cleanup } = createSuggestionButton(element, {
          suggestionText,
          suggestionId,
          handlers: {
            onClick: (cleanSuggestionText, sourceSuggestionId) => {
              let messageText = cleanSuggestionText;
              const { lastUserQuestion, lastAssistantResponse } = contextMessages;
              
              if (lastUserQuestion || lastAssistantResponse || sourceSuggestionId) {
                const contextData = JSON.stringify({
                  lastUserQuestion,
                  lastAssistantResponse,
                  sourceSuggestionId,
                });
                messageText = `__QWERY_CONTEXT__${contextData}__QWERY_CONTEXT_END__${cleanSuggestionText}`;
              }
              
              sendMessage({ text: messageText }, {});
              scrollToConversationBottom();
            },
          },
        });
        
        cleanupFunctions.push(cleanup);
      });

      return () => {
        cleanupFunctions.forEach((cleanup) => cleanup());
        processedElementsRef.current.clear();
      };
    } catch (error) {
      console.error('[useSuggestionEnhancement] Error processing suggestions:', error);
    }
  }, [detectedSuggestions, containerRef.current, sendMessage, contextMessages]);
}

