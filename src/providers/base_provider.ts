export interface ChatCompletionRequest {
  model?: string;
  messages?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface BaseProvider {
  chatCompletion(requestData: ChatCompletionRequest): Promise<Response>;
  getModels(): Promise<Response>;
}
