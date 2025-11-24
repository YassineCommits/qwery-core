export interface IntentAgentOptions {
  conversationId: string;
}

export class IntentAgent {
  private readonly conversationId: string;

  constructor(opts: IntentAgentOptions) {
    this.conversationId = opts.conversationId;
  }
}
