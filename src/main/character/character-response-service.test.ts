import { describe, expect, it, vi } from "vitest";
import { createActiveCharacterResponseService } from "./character-response-service";

describe("Active Character Response service", () => {
  it("freezes the active character settings once and gives every caller the same original-first response", async () => {
    const complete = vi.fn(async () => ({
      characterId: "local.hoshino",
      original: { text: "おやすみなさい、先生。", language: "ja" },
      translation: {
        status: "ready" as const,
        text: "晚安，老师。",
        targetLanguage: "zh-CN" as const,
        cache: "miss" as const,
      },
    }));
    const service = createActiveCharacterResponseService({
      runtime: {
        getSnapshot: () => ({
          activeCharacter: {
            id: "local.hoshino",
            state: { translationCacheRoot: "/tmp/hoshino/translation-cache" },
          },
        }),
        getActiveResponseSettings: () => ({
          characterId: "local.hoshino",
          language: "ja",
          translation: { status: "available" as const, targetLanguage: "zh-CN" as const, enabled: true },
        }),
      },
      pipeline: { complete },
    });

    const result = await service.complete("おやすみなさい、先生。");

    expect(service.getStatus()).toEqual({
      enabled: true,
      characterId: "local.hoshino",
      targetLanguage: "zh-CN",
    });
    expect(complete).toHaveBeenCalledWith({
      characterId: "local.hoshino",
      originalText: "おやすみなさい、先生。",
      language: "ja",
      translation: { status: "available", targetLanguage: "zh-CN", enabled: true },
      cacheRoot: "/tmp/hoshino/translation-cache",
      signal: undefined,
    });
    expect(result).toEqual({
      characterId: "local.hoshino",
      original: { text: "おやすみなさい、先生。", language: "ja" },
      translation: { status: "ready", text: "晚安，老师。", targetLanguage: "zh-CN" },
    });
    // Pipeline 的缓存命中信息属于内部实现，渠道不能把它当作角色回复协议的一部分。
    expect(result.translation).not.toHaveProperty("cache");
  });

  it("fails closed when no Active Character exists", async () => {
    const service = createActiveCharacterResponseService({
      runtime: {
        getSnapshot: () => ({ activeCharacter: null }),
        getActiveResponseSettings: () => {
          throw new Error("should not read settings");
        },
      },
      pipeline: { complete: vi.fn() },
    });

    expect(() => service.getStatus()).toThrow("当前没有可用的活动角色");
    await expect(service.complete("hello")).rejects.toThrow("当前没有可用的活动角色");
  });

  it("keeps the cross-channel response single-language when translation is disabled", async () => {
    const complete = vi.fn(async () => ({
      characterId: "local.hoshino",
      original: { text: "おやすみなさい、先生。", language: "ja" },
      translation: { status: "disabled" as const },
    }));
    const service = createActiveCharacterResponseService({
      runtime: {
        getSnapshot: () => ({
          activeCharacter: {
            id: "local.hoshino",
            state: { translationCacheRoot: "/tmp/hoshino/translation-cache" },
          },
        }),
        getActiveResponseSettings: () => ({
          characterId: "local.hoshino",
          language: "ja",
          translation: { status: "available" as const, targetLanguage: "zh-CN" as const, enabled: false },
        }),
      },
      pipeline: { complete },
    });

    expect(await service.complete("おやすみなさい、先生。")).toEqual({
      characterId: "local.hoshino",
      original: { text: "おやすみなさい、先生。", language: "ja" },
    });
    expect(service.getStatus().enabled).toBe(false);
  });
});
