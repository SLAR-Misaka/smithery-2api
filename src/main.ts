import { settings } from "./config.ts";
import { SmitheryProvider } from "./providers/smithery_provider.ts";
import { HttpError } from "./errors/http_error.ts";

const provider = new SmitheryProvider();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function verifyApiKey(request: Request): Response | null {
  const masterKey = settings.API_MASTER_KEY;
  if (!masterKey || masterKey === "1") {
    return null;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization || !authorization.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({
      error: {
        message: "需要 Bearer Token 认证。",
        type: "unauthorized",
      },
    }, 401);
  }

  const token = authorization.slice(7).trim();
  if (token !== masterKey) {
    return jsonResponse({
      error: {
        message: "无效的 API Key。",
        type: "forbidden",
      },
    }, 403);
  }

  return null;
}

async function handleChatCompletion(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    return await provider.chatCompletion(body);
  } catch (error) {
    console.error("处理聊天请求时发生顶层错误:", error);
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({
      error: {
        message: `内部服务器错误: ${message}`,
        type: "internal_server_error",
      },
    }, status);
  }
}

async function handleListModels(): Promise<Response> {
  try {
    return await provider.getModels();
  } catch (error) {
    console.error("获取模型列表时发生错误:", error);
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({
      error: {
        message: `无法获取模型列表: ${message}`,
        type: "internal_server_error",
      },
    }, status);
  }
}

console.info(
  `应用启动中... ${settings.APP_NAME} v${settings.APP_VERSION}`,
);
console.info("服务已进入 'Fetch' 模式，将自动处理 Smithery 流式响应。");
console.info(
  `服务将在 http://localhost:${settings.NGINX_PORT} 上可用`,
);

Deno.serve({ hostname: "0.0.0.0", port: settings.NGINX_PORT }, async (request) => {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    return jsonResponse({
      message:
        `欢迎来到 ${settings.APP_NAME} v${settings.APP_VERSION}. 服务运行正常。`,
    });
  }

  if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
    const authResponse = verifyApiKey(request);
    if (authResponse) return authResponse;
    return await handleChatCompletion(request);
  }

  if (url.pathname === "/v1/models" && request.method === "GET") {
    const authResponse = verifyApiKey(request);
    if (authResponse) return authResponse;
    return await handleListModels();
  }

  return jsonResponse({
    error: {
      message: "未找到对应的资源。",
      type: "not_found",
    },
  }, 404);
});
