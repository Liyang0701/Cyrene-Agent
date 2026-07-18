import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { createCharacterResponsePipeline } from "./character-response-pipeline";

describe("Character Response Pipeline", () => {
  it("keeps the finalized original immutable and performs no translation when the overlay is disabled", async () => {
    const translate = vi.fn(async () => "这个翻译不应该被调用");
    const pipeline = createCharacterResponsePipeline({ translate });

    const response = await pipeline.complete({
      characterId: "local.hoshino",
      originalText: "うへ〜、先生。今日もゆっくり行こうか。",
      language: "ja",
      translation: {
        status: "available",
        targetLanguage: "zh-CN",
        enabled: false,
      },
    });

    expect(response).toEqual({
      characterId: "local.hoshino",
      original: {
        text: "うへ〜、先生。今日もゆっくり行こうか。",
        language: "ja",
      },
      translation: { status: "disabled" },
    });
    expect(translate).not.toHaveBeenCalled();
    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(response.original)).toBe(true);
    expect(Object.isFrozen(response.translation)).toBe(true);
  });

  it("returns a subordinate Chinese translation without changing the finalized Japanese original", async () => {
    const translate = vi.fn(async () => "呼啊〜老师。今天也慢慢来吧。");
    const pipeline = createCharacterResponsePipeline({ translate });

    const response = await pipeline.complete({
      characterId: "local.hoshino",
      originalText: "うへ〜、先生。今日もゆっくり行こうか。",
      language: "ja",
      translation: {
        status: "available",
        targetLanguage: "zh-CN",
        enabled: true,
      },
      cacheRoot: fs.mkdtempSync(path.join(os.tmpdir(), "character-translation-cache-")),
    });

    expect(response).toEqual({
      characterId: "local.hoshino",
      original: {
        text: "うへ〜、先生。今日もゆっくり行こうか。",
        language: "ja",
      },
      translation: {
        status: "ready",
        text: "呼啊〜老师。今天也慢慢来吧。",
        targetLanguage: "zh-CN",
        cache: "miss",
      },
    });
    expect(translate).toHaveBeenCalledOnce();
    expect(translate).toHaveBeenCalledWith(expect.objectContaining({
      text: "うへ〜、先生。今日もゆっくり行こうか。",
      sourceLanguage: "ja",
      targetLanguage: "zh-CN",
      signal: expect.any(AbortSignal),
    }));
  });

  it("reuses a persistent per-character translation cache after the pipeline restarts", async () => {
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-translation-persistent-"));
    const translate = vi.fn(async () => "老师还真是拿你没办法呢。");
    const input = {
      characterId: "local.hoshino",
      originalText: "先生も仕方ないね。",
      language: "ja",
      translation: {
        status: "available" as const,
        targetLanguage: "zh-CN" as const,
        enabled: true,
      },
      cacheRoot,
    };

    const first = await createCharacterResponsePipeline({ translate }).complete(input);
    const afterRestart = await createCharacterResponsePipeline({ translate }).complete(input);

    expect(first.translation).toMatchObject({ status: "ready", cache: "miss" });
    expect(afterRestart.translation).toEqual({
      status: "ready",
      text: "老师还真是拿你没办法呢。",
      targetLanguage: "zh-CN",
      cache: "hit",
    });
    expect(translate).toHaveBeenCalledOnce();
    expect(fs.readdirSync(cacheRoot)).toHaveLength(1);
  });

  it("protects code, commands, paths, URLs, identifiers and structured blocks from translation", async () => {
    const originalText = [
      "手順は次の通り。",
      "npm run dev",
      "`CharacterRuntime.getSnapshot()` を使う。",
      "https://127.0.0.1:8080/v1 を開く。",
      "/Users/kano/Documents/local-llms/qwen3.5-9b/model は変えない。",
      "```json",
      "{\"characterId\":\"local.hoshino\",\"enabled\":true}",
      "```",
      "brew install ffmpeg",
      "./scripts/start.sh --safe",
      "character_id と CYRENE_AGENT を保持する。",
      "enabled: true",
      "{\"mode\":\"local\"}",
      "<character id=\"local.hoshino\">星野</character>",
    ].join("\n");
    let protectedRequest = "";
    const translate = vi.fn(async ({ text }: Readonly<{ text: string }>) => {
      protectedRequest = text;
      return text
        .replace("手順は次の通り。", "步骤如下。")
        .replace("を使う。", "。请使用它。")
        .replace("を開く。", "。请打开它。")
        .replace("は変えない。", "。不要修改它。");
    });
    const response = await createCharacterResponsePipeline({ translate }).complete({
      characterId: "local.hoshino",
      originalText,
      language: "ja",
      translation: {
        status: "available",
        targetLanguage: "zh-CN",
        enabled: true,
      },
    });

    expect(protectedRequest).not.toContain("npm run dev");
    expect(protectedRequest).not.toContain("CharacterRuntime.getSnapshot()");
    expect(protectedRequest).not.toContain("https://127.0.0.1:8080/v1");
    expect(protectedRequest).not.toContain("/Users/kano/Documents/local-llms/qwen3.5-9b/model");
    expect(protectedRequest).not.toContain("characterId");
    expect(protectedRequest).not.toContain("brew install ffmpeg");
    expect(protectedRequest).not.toContain("./scripts/start.sh --safe");
    expect(protectedRequest).not.toContain("character_id");
    expect(protectedRequest).not.toContain("CYRENE_AGENT");
    expect(protectedRequest).not.toContain("enabled: true");
    expect(protectedRequest).not.toContain("{\"mode\":\"local\"}");
    expect(protectedRequest).not.toContain("<character id=");
    expect(protectedRequest).toMatch(/__CYRENE_PROTECTED_\d{4}__/);
    expect(response.translation).toEqual({
      status: "ready",
      text: [
        "步骤如下。",
        "npm run dev",
        "`CharacterRuntime.getSnapshot()` 。请使用它。",
        "https://127.0.0.1:8080/v1 。请打开它。",
        "/Users/kano/Documents/local-llms/qwen3.5-9b/model 。不要修改它。",
        "```json",
        "{\"characterId\":\"local.hoshino\",\"enabled\":true}",
        "```",
        "brew install ffmpeg",
        "./scripts/start.sh --safe",
        "character_id と CYRENE_AGENT を保持する。",
        "enabled: true",
        "{\"mode\":\"local\"}",
        "<character id=\"local.hoshino\">星野</character>",
      ].join("\n"),
      targetLanguage: "zh-CN",
      cache: "miss",
    });
  });

  it("preserves the original response and returns an explicit state when the provider fails", async () => {
    const pipeline = createCharacterResponsePipeline({
      translate: vi.fn(async () => {
        throw new Error("local model is unavailable");
      }),
    });

    const response = await pipeline.complete({
      characterId: "local.hoshino",
      originalText: "おじさん、ちょっと休みたいなあ。",
      language: "ja",
      translation: {
        status: "available",
        targetLanguage: "zh-CN",
        enabled: true,
      },
    });

    expect(response.original.text).toBe("おじさん、ちょっと休みたいなあ。");
    expect(response.translation).toEqual({
      status: "failed",
      targetLanguage: "zh-CN",
      code: "provider-error",
      message: "local model is unavailable",
    });
  });

  it("times out a slow Translation Pass without delaying or replacing the original response", async () => {
    const pipeline = createCharacterResponsePipeline({
      timeoutMs: 5,
      translate: vi.fn(async () => new Promise<string>((resolve) => {
        setTimeout(() => resolve("过晚的翻译"), 25);
      })),
    });

    const response = await pipeline.complete({
      characterId: "local.hoshino",
      originalText: "大丈夫、おじさんを信じてよ。",
      language: "ja",
      translation: {
        status: "available",
        targetLanguage: "zh-CN",
        enabled: true,
      },
    });

    expect(response.original.text).toBe("大丈夫、おじさんを信じてよ。");
    expect(response.translation).toEqual({
      status: "failed",
      targetLanguage: "zh-CN",
      code: "timeout",
      message: "翻译超时",
    });
  });

  it("rejects empty or placeholder-damaging output instead of caching a broken translation", async () => {
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-translation-invalid-output-"));
    const pipeline = createCharacterResponsePipeline({
      translate: vi.fn(async () => "请运行该命令。"),
    });

    const response = await pipeline.complete({
      characterId: "local.hoshino",
      originalText: "`npm run dev` を実行して。",
      language: "ja",
      translation: {
        status: "available",
        targetLanguage: "zh-CN",
        enabled: true,
      },
      cacheRoot,
    });

    expect(response.translation).toEqual({
      status: "failed",
      targetLanguage: "zh-CN",
      code: "invalid-output",
      message: "翻译结果破坏了受保护内容",
    });
    expect(fs.readdirSync(cacheRoot)).toHaveLength(0);
  });
});
