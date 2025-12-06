import { ollama } from 'ai-sdk-ollama';
import { LanguageModel } from 'ai';

type ModelProvider = {
  resolveModel: (modelName: string) => LanguageModel;
};

export type OllamaModelProviderOptions = {
  baseUrl?: string;
  defaultModel?: string;
};

export function createOllamaModelProvider({
  defaultModel,
}: OllamaModelProviderOptions = {}): ModelProvider {
  return {
    resolveModel: (modelName) => {
      const finalModel = modelName || defaultModel;
      if (!finalModel) {
        throw new Error(
          "[AgentFactory] Missing Ollama model. Provide it as 'ollama/<model-name>' or set OLLAMA_MODEL.",
        );
      }
      return ollama(finalModel, {});
    },
  };
}
