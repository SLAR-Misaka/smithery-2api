<div align="center">

# 🤖 smithery-2api 🤖

**将 [Smithery.ai](https://smithery.ai/) 强大的 AI 模型能力无缝转换为兼容 OpenAI API 格式的转换器**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Deno Version](https://img.shields.io/badge/Deno-1.44%2B-black?logo=deno)](https://deno.land/)
[![Docker Support](https://img.shields.io/badge/docker-supported-blue.svg?logo=docker)](https://www.docker.com/)
[![GitHub Repo stars](https://img.shields.io/github/stars/lzA6/smithery-2api?style=social)](https://github.com/lzA6/smithery-2api)

</div>

> "任何足够先进的技术，都与魔法无异。" —— 亚瑟·克拉克
>
> 我们不创造魔法，我们只是让每个人都能成为魔法师。`smithery-2api` 的诞生，源于一个简单的信念：强大的工具应该被更广泛、更便捷地使用。全新的 Deno 版本继续践行这一理念，在保证性能的同时进一步简化部署体验。

---

## ✨ 核心特性

* **🚀 零成本接入** - 免费将 Smithery.ai 的多种模型接入现有 OpenAI 生态
* **🔌 高度兼容** - 完全模拟 OpenAI 的 `/v1/chat/completions` 和 `/v1/models` 接口
* **🔄 多账号轮询** - 支持配置多个 Smithery.ai 账号，自动轮询提高稳定性
* **💨 无状态设计** - 极致轻量，易于水平扩展，保护用户隐私
* **📡 原生流式输出** - 使用 Deno 原生流 API 将 SSE 转换为 OpenAI 兼容格式
* **📦 Docker 一键部署** - 官方 Deno 镜像，镜像体积极小
* **🔓 开源自由** - 采用 Apache 2.0 协议，自由使用、修改和分发

---

## 🏗️ 架构设计

### 核心工作原理

`smithery-2api` 充当一个智能的协议转换器，在 OpenAI API 格式和 Smithery.ai 内部 API 格式之间进行实时转换。

```mermaid
graph TB
    Client[第三方应用] -->|OpenAI 格式请求| API[smithery-2api]
    API -->|协议转换| Translator[API 转换器]
    Translator -->|身份伪装| Identity[身份伪装模块]
    Identity -->|Smithery 格式请求| Smithery[Smithery.ai 服务]
    Smithery -->|流式响应| API
    API -->|OpenAI 格式响应| Client

    subgraph "转换过程详解"
        Translator --> Format[格式转换]
        Identity --> Headers[请求头模拟]
        Identity --> Cookie[Cookie 处理]
        Identity --> Streaming[流式处理]
    end
```

### 技术实现细节

#### 1. API 格式转换

**技术核心**: `src/providers/smithery_provider.ts` 中的 `#convertMessagesToSmitheryFormat` 方法。

```ts
#convertMessagesToSmitheryFormat(messages: Array<Record<string, unknown>>) {
  return messages
    .map((message) => {
      const role = message?.role;
      const content = message?.content;
      if (typeof role !== "string" || typeof content !== "string") {
        return null;
      }
      return {
        role,
        parts: [{ type: "text", text: content }],
        id: `msg-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      };
    })
    .filter(Boolean);
}
```

#### 2. 身份认证与伪装

**技术核心**: `src/config.ts` 中的 `AuthCookie` 解析逻辑。

```ts
const cookieValueData = {
  access_token: accessToken,
  refresh_token: data?.refresh_token ?? null,
  token_type: data?.token_type ?? "bearer",
  expires_in: data?.expires_in ?? 3600,
  expires_at: data?.expires_at ?? 0,
  user: data?.user ?? null,
};

const cookieKey = `sb-${PROJECT_REF}-auth-token`;
const headerCookieString = `${cookieKey}=${JSON.stringify(cookieValueData)}`;
```

#### 3. 流式响应处理

**技术核心**: `src/providers/smithery_provider.ts` + `src/utils/sse.ts`。

```ts
const stream = new ReadableStream<Uint8Array>({
  async pull(controller) {
    const { value, done } = await reader.read();
    if (done) {
      controller.enqueue(createSseData(createChatCompletionChunk(id, model, "", "stop")));
      controller.enqueue(DONE_CHUNK);
      controller.close();
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const data = parseSseData(rawEvent);
      if (data.type === "text-delta") {
        controller.enqueue(createSseData(createChatCompletionChunk(id, model, data.delta)));
      }
    }
  },
});
```

---

## 🚀 快速开始

### 环境要求

- [Deno 1.44+](https://deno.land/)（本地运行）
- 或者 Docker 24+（容器部署）
- Git（获取代码）

### 部署步骤

#### 步骤 1: 获取项目代码

```bash
git clone https://github.com/lzA6/smithery-2api.git
cd smithery-2api
```

#### 步骤 2: 获取认证信息

1. 在浏览器中登录 [Smithery.ai](https://smithery.ai/)
2. 打开开发者工具 (F12)
3. 切换到 **Application** → **Local Storage** → `https://smithery.ai`
4. 找到键名为 `sb-spjawbfpwezjfmicopsl-auth-token` 的项
5. 复制完整的 value 值（JSON 格式）

#### 步骤 3: 配置环境变量

```bash
cp .env.example .env
vim .env
```

**环境变量配置示例**:

```env
# API 主密钥（用于客户端认证，可选）
API_MASTER_KEY="your-secure-master-key-here"

# Smithery.ai 认证信息（支持多个账号，自动轮询）
SMITHERY_COOKIE_1='{"access_token":"eyJ...","token_type":"bearer","expires_in":3600,...}'
SMITHERY_COOKIE_2='{"access_token":"eyJ...","token_type":"bearer","expires_in":3600,...}'

# 服务端口配置
NGINX_PORT=8088
```

#### 步骤 4: 启动服务

**方式一：本地 Deno 运行**

```bash
deno task dev
```

> `dev` 任务会自动加载 `.env` 文件，并监听在 `http://localhost:8088`。

**方式二：Docker 部署**

```bash
docker-compose up -d
```

容器启动后，服务将自动监听在 `http://localhost:8088`。

#### 步骤 5: 验证部署

```bash
curl -X GET "http://localhost:8088/v1/models" \
  -H "Authorization: Bearer your-secure-master-key-here"
```

---

## 💡 客户端配置示例

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8088/v1",
    api_key="your-secure-master-key-here"
)

stream = client.chat.completions.create(
    model="claude-haiku-4.5",
    messages=[{"role": "user", "content": "你好，介绍一下自己"}],
    stream=True,
)

for chunk in stream:
    delta = chunk.choices[0].delta.get("content")
    if delta:
        print(delta, end="", flush=True)
```

---

## 🧪 端点说明

### `POST /v1/chat/completions`

- **功能**: 模拟 OpenAI Chat Completions API，支持流式输出
- **鉴权**: Bearer Token（可选，根据 `API_MASTER_KEY` 是否配置）
- **请求体**:

```json
{
  "model": "claude-haiku-4.5",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "写一首七言绝句"}
  ],
  "stream": true
}
```

- **响应**: `text/event-stream`，与 OpenAI SSE 完全兼容

### `GET /v1/models`

- **功能**: 返回服务支持的模型列表
- **响应示例**:

```json
{
  "object": "list",
  "data": [
    {"id": "claude-haiku-4.5", "object": "model", "created": 1700000000, "owned_by": "lzA6"}
  ]
}
```

---

## 🛠️ 开发脚本

| 命令 | 说明 |
| --- | --- |
| `deno task dev` | 启动带 `.env` 文件加载的本地开发服务 |
| `deno task start` | 生产模式启动（用于 Docker CMD） |
| `deno fmt` | 根据 `deno.json` 的配置格式化代码 |
| `deno lint` | 使用 Deno 官方 Lint 规则进行静态检查 |

---

## 🤝 贡献指南

1. Fork 本仓库并克隆到本地
2. 基于 `main` 分支创建特性分支
3. 提交前运行 `deno fmt` 与 `deno lint`
4. 提交 PR 并详细描述改动内容

欢迎提交 Issue 或 PR，一起完善这个项目！

---

## 📄 许可证

本项目基于 [Apache 2.0](LICENSE) 许可证开源。欢迎自由使用、修改与分发。
