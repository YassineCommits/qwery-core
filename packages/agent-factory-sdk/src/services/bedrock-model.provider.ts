import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { AiSdkModelProvider } from './ai-sdk-model.provider';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

export type BedrockModelProviderOptions = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  defaultModel?: string;
};

export function createBedrockModelProvider({
  region,
  defaultModel,
}: BedrockModelProviderOptions): AiSdkModelProvider {
  const bedrock = createAmazonBedrock({
    region,
    credentialProvider: fromNodeProviderChain(),
  });

  return new AiSdkModelProvider({
    resolveModel: (modelName) => {
      const finalModel = modelName || defaultModel;
      if (!finalModel) {
        throw new Error(
          "[AgentFactory] Missing Amazon Bedrock model. Provide it as 'bedrock/<model-id>' or set BEDROCK_MODEL.",
        );
      }
      return bedrock(finalModel);
    },
  });
}
