// Export all from subdirectories
export * from './domain';
export * from './ports';
export * from './services';
export * from './agents';

// Reexport AI SDK
export type { UIMessage } from 'ai';
export {
  convertToModelMessages,
  streamText,
  generateText,
  validateUIMessages,
} from 'ai';
export { createAzure } from '@ai-sdk/azure';

const baseModels = [
  {
    name: 'azure/gpt-5-mini',
    value: 'azure/gpt-5-mini',
  },
  {
    name: 'ollama/deepseek-r1:8b',
    value: 'ollama/deepseek-r1:8b',
  },
  {
    name: 'webllm/Llama-3.1-8B-Instruct-q4f32_1-MLC',
    value: 'webllm/Llama-3.1-8B-Instruct-q4f32_1-MLC',
  },
  {
    name: 'transformer-browser/SmolLM2-360M-Instruct',
    value: 'transformer-browser/SmolLM2-360M-Instruct',
  },
  {
    name: 'browser/built-in',
    value: 'browser/built-in',
  },
];

export const SUPPORTED_MODELS = baseModels;
