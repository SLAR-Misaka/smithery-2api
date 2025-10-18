import { bold } from "https://deno.land/std@0.224.0/fmt/colors.ts";

export interface AuthCookie {
  headerCookieString: string;
  expiresAt: number;
}

export interface Settings {
  readonly APP_NAME: string;
  readonly APP_VERSION: string;
  readonly DESCRIPTION: string;
  readonly CHAT_API_URL: string;
  readonly TOKEN_REFRESH_URL: string;
  readonly SUPABASE_API_KEY: string;
  readonly API_MASTER_KEY: string | null;
  readonly AUTH_COOKIES: AuthCookie[];
  readonly API_REQUEST_TIMEOUT: number;
  readonly NGINX_PORT: number;
  readonly SESSION_CACHE_TTL: number;
  readonly KNOWN_MODELS: string[];
}

const PROJECT_REF = "spjawbfpwezjfmicopsl";

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAuthCookie(jsonString: string, index: number): AuthCookie | null {
  try {
    const data = JSON.parse(jsonString);
    const accessToken = data?.access_token;
    if (!accessToken || typeof accessToken !== "string") {
      console.warn(
        `SMITHERY_COOKIE_${index} 缺少 access_token 字段，已跳过。`,
      );
      return null;
    }

    const cookieValueData = {
      access_token: accessToken,
      refresh_token: data?.refresh_token ?? null,
      token_type: data?.token_type ?? "bearer",
      expires_in: data?.expires_in ?? 3600,
      expires_at: data?.expires_at ?? 0,
      user: data?.user ?? null,
    };

    const cookieKey = `sb-${PROJECT_REF}-auth-token`;
    const cookieValue = JSON.stringify(cookieValueData);
    const headerCookieString = `${cookieKey}=${cookieValue}`;

    return {
      headerCookieString,
      expiresAt: cookieValueData.expires_at,
    };
  } catch (error) {
    console.warn(`无法解析 SMITHERY_COOKIE_${index}:`, error);
    return null;
  }
}

function collectAuthCookies(): AuthCookie[] {
  const cookies: AuthCookie[] = [];
  for (let i = 1; i < 50; i++) {
    const raw = Deno.env.get(`SMITHERY_COOKIE_${i}`);
    if (!raw) {
      if (i === 1 && cookies.length === 0) {
        console.error(
          bold("未找到任何 SMITHERY_COOKIE_ 环境变量，服务无法启动。"),
        );
      }
      break;
    }
    const parsed = parseAuthCookie(raw, i);
    if (parsed) {
      cookies.push(parsed);
    }
  }
  if (cookies.length === 0) {
    throw new Error("必须至少配置一个有效的 SMITHERY_COOKIE_X 环境变量。");
  }
  return cookies;
}

export const settings: Settings = {
  APP_NAME: "smithery-2api",
  APP_VERSION: "2.0.0",
  DESCRIPTION:
    "一个将 smithery.ai 转换为兼容 OpenAI API 的高性能代理，使用 Deno 重新实现。",
  CHAT_API_URL: Deno.env.get("CHAT_API_URL") ?? "https://smithery.ai/api/chat",
  TOKEN_REFRESH_URL: Deno.env.get("TOKEN_REFRESH_URL") ??
    "https://spjawbfpwezjfmicopsl.supabase.co/auth/v1/token?grant_type=refresh_token",
  SUPABASE_API_KEY: Deno.env.get("SUPABASE_API_KEY") ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwamF3YmZwd2V6amZtaWNvcHNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQxNDc0MDUsImV4cCI6MjA0OTcyMzQwNX0.EBIg7_F2FZh4KZ3UNwZdBRjpp2fgHqXGJOvOSQ053MU",
  API_MASTER_KEY: Deno.env.get("API_MASTER_KEY") ?? null,
  AUTH_COOKIES: collectAuthCookies(),
  API_REQUEST_TIMEOUT: parseInteger(Deno.env.get("API_REQUEST_TIMEOUT"), 180),
  NGINX_PORT: parseInteger(Deno.env.get("NGINX_PORT"), 8088),
  SESSION_CACHE_TTL: parseInteger(Deno.env.get("SESSION_CACHE_TTL"), 3600),
  KNOWN_MODELS: (Deno.env.get("KNOWN_MODELS")?.split(",") ?? [
    "claude-haiku-4.5",
    "claude-sonnet-4.5",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "glm-4.6",
    "grok-4-fast-non-reasoning",
    "grok-4-fast-reasoning",
    "kimi-k2",
    "deepseek-reasoner",
  ]).map((model) => model.trim()).filter((model) => model.length > 0),
};
