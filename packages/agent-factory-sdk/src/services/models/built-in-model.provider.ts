import { builtInAI } from '@built-in-ai/core';
import { LanguageModel } from 'ai';

type ModelProvider = {
  resolveModel: (modelName: string) => LanguageModel;
};

export type BuiltInModelProviderOptions = Record<string, never>;

export function createBuiltInModelProvider(
  _options: BuiltInModelProviderOptions = {},
): ModelProvider {
  return {
    resolveModel: (_modelName) => {
      // Built-in AI doesn't use model names, it uses the browser's built-in model
      return builtInAI();
    },
  };
}
