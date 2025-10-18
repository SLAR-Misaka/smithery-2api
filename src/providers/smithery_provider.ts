import { settings } from "../config.ts";
import { HttpError } from "../errors/http_error.ts";
import { BaseProvider, ChatCompletionRequest } from "./base_provider.ts";
import {
  ChatCompletionChunk,
  DONE_CHUNK,
  createChatCompletionChunk,
  createSseData,
} from "../utils/sse.ts";

export class SmitheryProvider implements BaseProvider {
  #cookieIndex = 0;

  #getCookie(): string {
    const cookie = settings.AUTH_COOKIES[this.#cookieIndex];
    this.#cookieIndex = (this.#cookieIndex + 1) % settings.AUTH_COOKIES.length;
    return cookie.headerCookieString;
  }

  #convertMessagesToSmitheryFormat(
    messages: Array<Record<string, unknown>> = [],
  ): Array<Record<string, unknown>> {
    return messages
      .map((message) => {
        const role = message?.role;
        const content = message?.content;
        if (typeof role !== "string" || typeof content !== "string") {
          return null;
        }
        return {
          role,
          parts: [
            {
              type: "text",
              text: content,
            },
          ],
          id: `msg-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        };
      })
      .filter((message): message is Record<string, unknown> => Boolean(message));
  }

  #prepareHeaders(): HeadersInit {
    return {
      "Accept": "*/*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Content-Type": "application/json",
      "Cookie": this.#getCookie(),
      "Origin": "https://smithery.ai",
      "Referer": "https://smithery.ai/playground",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "priority": "u=1, i",
      "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-posthog-distinct-id": "5905f6b4-d74f-46b4-9b4f-9dbbccb29bee",
      "x-posthog-session-id": "0199f71f-8c42-7f9a-ba3a-ff5999dd444a",
      "x-posthog-window-id": "0199f71f-8c42-7f9a-ba3a-ff5ab5b20a8e",
    };
  }

  #preparePayload(
    model: string,
    messages: Array<Record<string, unknown>>,
  ): Record<string, unknown> {
    return {
      messages,
      tools: [],
      model,
      systemPrompt: "You are a helpful assistant.",
    };
  }

  #sseHeaders(): HeadersInit {
    return {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    };
  }

  #logRequest(payload: Record<string, unknown>): void {
    console.info("===================== [REQUEST TO SMITHERY (Stateless)] =====================");
    console.info(`URL: POST ${settings.CHAT_API_URL}`);
    console.info("PAYLOAD:\n" + JSON.stringify(payload, null, 2));
    console.info("=====================================================================================");
  }

  #logErrorResponse(status: number, body: string): void {
    console.error("==================== [RESPONSE FROM SMITHERY (ERROR)] ===================");
    console.error(`STATUS CODE: ${status}`);
    console.error("RESPONSE BODY:\n" + body);
    console.error("=================================================================");
  }

  #createErrorStream(
    requestId: string,
    model: string,
    message: string,
  ): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        const chunk = createChatCompletionChunk(requestId, model, message, "stop");
        controller.enqueue(createSseData(chunk));
        controller.enqueue(DONE_CHUNK);
        controller.close();
      },
    });
  }

  async chatCompletion(requestData: ChatCompletionRequest): Promise<Response> {
    const requestId = `chatcmpl-${crypto.randomUUID()}`;
    const model = typeof requestData.model === "string"
      ? requestData.model
      : "claude-haiku-4.5";
    const smitheryMessages = this.#convertMessagesToSmitheryFormat(
      Array.isArray(requestData.messages)
        ? requestData.messages as Array<Record<string, unknown>>
        : [],
    );

    const payload = this.#preparePayload(model, smitheryMessages);
    this.#logRequest(payload);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, settings.API_REQUEST_TIMEOUT * 1000);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(settings.CHAT_API_URL, {
        method: "POST",
        headers: this.#prepareHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("处理流时发生错误:", error);
      const stream = this.#createErrorStream(
        requestId,
        model,
        `内部服务器错误: ${error instanceof Error ? error.message : String(error)}`,
      );
      return new Response(stream, {
        status: 500,
        headers: this.#sseHeaders(),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!upstreamResponse.ok) {
      const body = await upstreamResponse.text();
      this.#logErrorResponse(upstreamResponse.status, body);
      const stream = this.#createErrorStream(
        requestId,
        model,
        `上游服务返回错误: ${upstreamResponse.status}`,
      );
      return new Response(stream, {
        status: upstreamResponse.status,
        headers: this.#sseHeaders(),
      });
    }

    if (!upstreamResponse.body) {
      throw new HttpError(502, "上游响应缺少可读的 body。");
    }

    const reader = upstreamResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let doneSent = false;

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { value, done } = await reader.read();
        if (done) {
          if (!doneSent) {
            const finalChunk = createChatCompletionChunk(requestId, model, "", "stop");
            controller.enqueue(createSseData(finalChunk));
            controller.enqueue(DONE_CHUNK);
            doneSent = true;
          }
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const lines = rawEvent.split(/\r?\n/);
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;

            if (data === "[DONE]") {
              if (!doneSent) {
                const finalChunk = createChatCompletionChunk(requestId, model, "", "stop");
                controller.enqueue(createSseData(finalChunk));
                controller.enqueue(DONE_CHUNK);
                doneSent = true;
              }
              controller.close();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed?.type === "text-delta") {
                const delta = parsed.delta;
                const deltaContent = typeof delta === "string"
                  ? delta
                  : typeof delta?.text === "string"
                    ? delta.text
                    : "";
                const chunk: ChatCompletionChunk = createChatCompletionChunk(
                  requestId,
                  model,
                  deltaContent,
                );
                controller.enqueue(createSseData(chunk));
              }
            } catch (error) {
              console.warn("无法解析 SSE 数据块:", error);
            }
          }
        }
      },
      async cancel(reason) {
        await reader.cancel(reason);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: this.#sseHeaders(),
    });
  }

  async getModels(): Promise<Response> {
    const data = {
      object: "list",
      data: settings.KNOWN_MODELS.map((name) => ({
        id: name,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "lzA6",
      })),
    };

    return Response.json(data);
  }
}
