const encoder = new TextEncoder();

export const DONE_CHUNK = encoder.encode("data: [DONE]\n\n");

export function createSseData(data: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { content: string };
    finish_reason: string | null;
  }>;
}

export function createChatCompletionChunk(
  requestId: string,
  model: string,
  content: string,
  finishReason: string | null = null,
): ChatCompletionChunk {
  return {
    id: requestId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: finishReason,
      },
    ],
  };
}
