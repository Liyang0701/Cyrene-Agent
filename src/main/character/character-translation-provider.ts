import { recordUsage } from "../token-usage-store";
import { isLoopbackModelUrl } from "../channels/channel-model-endpoint";
import {
  getAdapterForConfig,
  type VendorConfig,
} from "../orchestrator/vendors";
import type { CharacterTranslationProvider } from "./character-response-pipeline";

function buildTranslationSystemPrompt(sourceLanguage: string): string {
  return [
    "你是角色回复的翻译器。",
    `源语言标签：${sourceLanguage}。将用户提供的原文翻译为自然、准确的简体中文。`,
    "只输出简体中文译文，不要解释，不要添加标题或引号。",
    "必须原样保留所有 __CYRENE_PROTECTED_0000__ 形式的占位符，不得改写、删除、重排或重复。",
  ].join("\n");
}

type TranslationModelProfile = Readonly<{
  baseUrl: string;
  model: string;
  apiKey: string;
  explicitTransport?: VendorConfig["explicitTransport"];
  reasoning?: VendorConfig["reasoning"];
}>;

export type TranslationModelSettings = TranslationModelProfile & Readonly<{
  provider: string;
  perProvider?: Readonly<Record<string, TranslationModelProfile>>;
}>;

function isLocalQwen35Profile(profile: TranslationModelProfile): boolean {
  return isLoopbackModelUrl(profile.baseUrl) && /qwen[\s._\-/]*3[.\s_-]*5/i.test(profile.model);
}

export function resolveLocalCharacterTranslationConfig(
  settings: TranslationModelSettings,
): VendorConfig {
  const candidates: Array<Readonly<{ provider: string; profile: TranslationModelProfile }>> = [
    { provider: settings.provider, profile: settings },
    ...Object.entries(settings.perProvider ?? {}).map(([provider, profile]) => ({ provider, profile })),
  ];
  const selected = candidates.find(({ profile }) => isLocalQwen35Profile(profile));
  if (!selected) throw new Error("未找到本地 Qwen3.5 模型配置");
  return {
    provider: selected.provider,
    baseUrl: selected.profile.baseUrl,
    model: selected.profile.model,
    apiKey: selected.profile.apiKey,
    explicitTransport: selected.profile.explicitTransport,
    reasoning: selected.profile.reasoning,
  };
}

function stripThinkBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

async function readHttpError(response: Response): Promise<string> {
  try {
    const parsed = await response.json() as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Fall back to a stable HTTP status message.
  }
  return `本地翻译模型请求失败：HTTP ${response.status}`;
}

export function createLocalCharacterTranslationProvider(options: Readonly<{
  getSettings: () => VendorConfig;
  fetchFn?: typeof fetch;
}>): CharacterTranslationProvider {
  return async (request) => {
    const settings = options.getSettings();
    if (!isLoopbackModelUrl(settings.baseUrl)) {
      throw new Error("翻译只允许使用本机模型服务");
    }
    const config: VendorConfig = {
      ...settings,
      reasoning: { mode: "off" },
    };
    const adapter = getAdapterForConfig(config);
    const http = adapter.buildRequest({
      model: config.model,
      messages: [
        { role: "system", content: buildTranslationSystemPrompt(request.sourceLanguage) },
        {
          role: "user",
          content: `${request.text}\n\n/no_think`,
        },
      ],
      stream: false,
      maxTokens: 1_200,
    }, config);
    const response = await (options.fetchFn ?? fetch)(http.url, {
      method: "POST",
      headers: http.headers,
      body: http.body,
      signal: request.signal,
    });
    if (!response.ok) throw new Error(await readHttpError(response));
    const raw = await response.json();
    const parsed = adapter.parseResponse(raw);
    if (parsed.usage) recordUsage(parsed.usage.input, parsed.usage.output, 1);
    return stripThinkBlocks(parsed.text ?? "");
  };
}
