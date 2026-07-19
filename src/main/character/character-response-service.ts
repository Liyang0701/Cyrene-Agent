import type {
  CharacterResponse,
  CharacterResponsePipeline,
} from "./character-response-pipeline";
import type { CharacterResponseSettings } from "./character-runtime";
import type { CharacterTranslationDisplayResult } from "../../shared/character-response";

type ActiveCharacterResponseRuntime = Readonly<{
  getSnapshot(): Readonly<{
    activeCharacter: Readonly<{
      id: string;
      state: Readonly<{ translationCacheRoot: string }>;
    }> | null;
  }>;
  getActiveResponseSettings(): CharacterResponseSettings;
}>;

export type ActiveCharacterResponseStatus = Readonly<{
  enabled: boolean;
  characterId: string;
  targetLanguage?: "zh-CN";
}>;

/**
 * 唯一允许跨桌面、通话和外部渠道传播的角色回复形状。
 * 翻译缓存、provider 等管线细节留在 Pipeline 内部，绝不能混入渠道协议。
 */
export type ActiveCharacterResponse = Readonly<{
  characterId: string;
  original: Readonly<{
    text: string;
    language: string;
  }>;
  translation?: CharacterTranslationDisplayResult;
}>;

export type ActiveCharacterResponseService = Readonly<{
  getStatus(): ActiveCharacterResponseStatus;
  complete(originalText: string, signal?: AbortSignal): Promise<ActiveCharacterResponse>;
}>;

function toDisplayResponse(response: CharacterResponse): ActiveCharacterResponse {
  const translation: CharacterTranslationDisplayResult | undefined = response.translation.status === "ready"
    ? {
      status: "ready",
      text: response.translation.text,
      targetLanguage: response.translation.targetLanguage,
    }
    : response.translation.status === "failed"
      ? {
        status: "failed",
        targetLanguage: response.translation.targetLanguage,
        code: response.translation.code,
        message: response.translation.message,
      }
      : undefined;
  return Object.freeze({
    characterId: response.characterId,
    original: Object.freeze({ ...response.original }),
    ...(translation ? { translation: Object.freeze(translation) } : {}),
  });
}

function requireActiveResponse(
  runtime: ActiveCharacterResponseRuntime,
): Readonly<{
  characterId: string;
  cacheRoot: string;
  settings: CharacterResponseSettings;
}> {
  const active = runtime.getSnapshot().activeCharacter;
  if (!active) throw new Error("当前没有可用的活动角色");
  const settings = runtime.getActiveResponseSettings();
  if (settings.characterId !== active.id) {
    throw new Error("活动角色响应设置不一致");
  }
  return Object.freeze({
    characterId: active.id,
    cacheRoot: active.state.translationCacheRoot,
    settings,
  });
}

export function createActiveCharacterResponseService(input: Readonly<{
  runtime: ActiveCharacterResponseRuntime;
  pipeline: CharacterResponsePipeline;
}>): ActiveCharacterResponseService {
  return Object.freeze({
    getStatus(): ActiveCharacterResponseStatus {
      const active = requireActiveResponse(input.runtime);
      return Object.freeze({
        enabled: active.settings.translation.status === "available" && active.settings.translation.enabled,
        characterId: active.characterId,
        ...(active.settings.translation.status === "available"
          ? { targetLanguage: active.settings.translation.targetLanguage }
          : {}),
      });
    },
    async complete(originalText: string, signal?: AbortSignal): Promise<ActiveCharacterResponse> {
      const active = requireActiveResponse(input.runtime);
      const response = await input.pipeline.complete({
        characterId: active.characterId,
        originalText,
        language: active.settings.language,
        translation: active.settings.translation,
        cacheRoot: active.cacheRoot,
        signal,
      });
      return toDisplayResponse(response);
    },
  });
}
