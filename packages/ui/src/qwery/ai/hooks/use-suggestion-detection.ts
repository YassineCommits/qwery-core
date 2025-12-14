import { useMemo, RefObject } from 'react';
import { isSuggestionPattern, extractSuggestionText, validateSuggestionElement } from '../utils/suggestion-pattern';

export interface DetectedSuggestion {
  element: Element;
  suggestionText: string;
}

export function useSuggestionDetection(
  containerRef: RefObject<HTMLElement | null>,
  isReady: boolean,
): DetectedSuggestion[] {
  return useMemo(() => {
    if (!containerRef.current || !isReady) {
      return [];
    }

    const container = containerRef.current;
    const allElements = Array.from(container.querySelectorAll('li, p'));
    const detected: DetectedSuggestion[] = [];

    allElements.forEach((element) => {
      if (element.querySelector('[data-suggestion-button]')) {
        return;
      }

      const elementText = element.textContent || '';
      
      if (isSuggestionPattern(elementText)) {
        const suggestionText = extractSuggestionText(elementText);
        if (suggestionText && suggestionText.length > 0 && validateSuggestionElement(element, elementText)) {
          detected.push({ element, suggestionText });
        }
      }
    });

    return detected;
  }, [containerRef.current, isReady]);
}

