import { describe, expect, it } from "vitest";
import {
  parseTranslationOverlayEvent,
  translationOverlayView,
} from "./translation-overlay";

describe("desktop chat Translation Overlay", () => {
  it("maps lifecycle events to a subordinate loading and ready presentation", () => {
    const loading = parseTranslationOverlayEvent("character.translation.started", {
      enabled: true,
      characterId: "local.hoshino",
      targetLanguage: "zh-CN",
    });
    expect(translationOverlayView(loading)).toEqual({
      tone: "pending",
      label: "正在生成中文译文…",
      text: "",
    });

    const ready = parseTranslationOverlayEvent("character.translation.ready", {
      characterId: "local.hoshino",
      original: { text: "うへ〜、先生。", language: "ja" },
      translation: {
        status: "ready",
        text: "呼啊〜老师。",
        targetLanguage: "zh-CN",
        cache: "miss",
      },
    });
    expect(ready).toEqual({ status: "ready", text: "呼啊〜老师。", targetLanguage: "zh-CN" });
    expect(translationOverlayView(ready)).toEqual({
      tone: "ready",
      label: "中文译文",
      text: "呼啊〜老师。",
    });
  });

  it("keeps failure explicit and rejects malformed event payloads", () => {
    const failed = parseTranslationOverlayEvent("character.translation.failed", {
      characterId: "local.hoshino",
      original: { text: "先生。", language: "ja" },
      translation: {
        status: "failed",
        targetLanguage: "zh-CN",
        code: "timeout",
        message: "翻译超时",
      },
    });
    expect(translationOverlayView(failed)).toEqual({
      tone: "failed",
      label: "中文译文暂不可用",
      text: "翻译超时",
    });
    expect(parseTranslationOverlayEvent("character.translation.ready", {
      translation: { status: "ready", text: "", targetLanguage: "zh-CN" },
    })).toBeNull();
  });
});
