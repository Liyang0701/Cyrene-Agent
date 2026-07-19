import type {
  FidelityGenerationRequest,
  FidelityGenerationResult,
  FidelityGenerator,
} from "./character-fidelity";

/**
 * 评测中的角色内容只能送往本机回环服务。不要为此 adapter 添加 API key、
 * tools、远端 fallback 或遥测；这些都会破坏盲测的本地边界。
 */
export type LocalFidelityFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type LocalFidelityGeneratorOptions = Readonly<{
  fetchFn?: LocalFidelityFetch;
  timeoutMs?: number;
}>;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]"]);
const DEFAULT_TIMEOUT_MS = 120_000;

function localChatCompletionUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Character Fidelity 本机模型服务地址无效");
  }
  if (url.protocol !== "http:"
    || !LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
    || url.username
    || url.password) {
    throw new Error("Character Fidelity 只允许使用本机模型服务");
  }
  const basePath = url.pathname.replace(/\/+$/u, "");
  url.pathname = `${basePath || ""}/chat/completions`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function removeThinkingEnvelope(text: string): string {
  return text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/u, "").trim();
}

function completionText(payload: unknown): Readonly<{ text: string; requestId?: string }> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Character Fidelity 本机模型服务返回无效 JSON");
  }
  const record = payload as Record<string, unknown>;
  const choices = record["choices"];
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined;
  const message = firstChoice && typeof firstChoice === "object" && !Array.isArray(firstChoice)
    ? (firstChoice as Record<string, unknown>)["message"]
    : undefined;
  const content = message && typeof message === "object" && !Array.isArray(message)
    ? (message as Record<string, unknown>)["content"]
    : undefined;
  if (typeof content !== "string") {
    throw new Error("Character Fidelity 本机模型服务未返回文本回答");
  }
  const text = removeThinkingEnvelope(content);
  if (!text) throw new Error("Character Fidelity 本机模型服务返回空回答");
  return Object.freeze({
    text,
    ...(typeof record["id"] === "string" ? { requestId: record["id"] } : {}),
  });
}

function timeoutFor(options: LocalFidelityGeneratorOptions): number {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("Character Fidelity 本机模型服务超时必须为正整数");
  }
  return timeoutMs;
}

/**
 * 适配现有的 Qwen OpenAI-compatible `/v1` 服务。每次调用都不发送任何 tools，
 * 并且不读取、记录或发送任何云端凭据。
 */
export function createLocalFidelityGenerator(
  options: LocalFidelityGeneratorOptions = {},
): FidelityGenerator {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = timeoutFor(options);
  return async (request: FidelityGenerationRequest): Promise<FidelityGenerationResult> => {
    if (request.model.provider !== "local") {
      throw new Error("Character Fidelity 只允许使用本机模型服务");
    }
    const url = localChatCompletionUrl(request.model.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: request.model.model,
          messages: [
            {
              role: "system",
              content: `${request.systemPrompt}\n\n/no_think`,
            },
            { role: "user", content: request.prompt.text },
          ],
          stream: false,
          temperature: request.model.temperature ?? 0.2,
          max_tokens: request.model.maxTokens ?? 384,
          seed: request.seed,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Character Fidelity 本机模型服务请求失败：HTTP ${response.status}`);
      }
      return completionText(await response.json());
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Character Fidelity 本机模型服务请求超时（${timeoutMs}ms）`);
      }
      if (error instanceof Error && error.message.startsWith("Character Fidelity")) throw error;
      throw new Error("Character Fidelity 本机模型服务请求失败");
    } finally {
      clearTimeout(timer);
    }
  };
}
