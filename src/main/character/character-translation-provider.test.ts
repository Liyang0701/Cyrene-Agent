import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildRequest: vi.fn(),
  parseResponse: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock("../orchestrator/vendors", () => ({
  getAdapterForConfig: () => ({
    buildRequest: mocks.buildRequest,
    parseResponse: mocks.parseResponse,
  }),
}));
vi.mock("../token-usage-store", () => ({ recordUsage: mocks.recordUsage }));

import {
  createLocalCharacterTranslationProvider,
  resolveLocalCharacterTranslationConfig,
} from "./character-translation-provider";

describe("local Character Translation provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildRequest.mockImplementation((request: unknown) => ({
      url: "http://127.0.0.1:8080/v1/chat/completions",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }));
  });

  it("selects a saved local Qwen3.5 profile without changing the active cloud chat model", () => {
    expect(resolveLocalCharacterTranslationConfig({
      provider: "Qwen（通义千问）",
      baseUrl: "https://example.aliyuncs.com/v1",
      model: "qwen3-max",
      apiKey: "cloud-secret",
      explicitTransport: "openai",
      perProvider: {
        "ChatGPT（OpenAI）": {
          baseUrl: "http://127.0.0.1:8080/v1",
          model: "/Users/kano/Documents/local-llms/qwen3.5-9b/model",
          apiKey: "",
          explicitTransport: "auto",
        },
      },
    })).toEqual({
      provider: "ChatGPT（OpenAI）",
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "/Users/kano/Documents/local-llms/qwen3.5-9b/model",
      apiKey: "",
      explicitTransport: "auto",
      reasoning: undefined,
    });
  });

  it("does not silently fall back to an older local Qwen3 profile", () => {
    expect(() => resolveLocalCharacterTranslationConfig({
      provider: "local",
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "/Users/kano/Documents/local-llms/qwen3-4b/model",
      apiKey: "",
    })).toThrow("未找到本地 Qwen3.5 模型配置");
  });

  it("uses the configured loopback Qwen model as a non-streaming translation-only request", async () => {
    mocks.parseResponse.mockReturnValue({
      text: "<think>ignored</think>\n呼啊〜老师。 __CYRENE_PROTECTED_0000__",
      usage: { input: 20, output: 8 },
    });
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    const translate = createLocalCharacterTranslationProvider({
      getSettings: () => ({
        provider: "local",
        baseUrl: "http://127.0.0.1:8080/v1",
        model: "qwen3.5-9b",
        apiKey: "",
        explicitTransport: "openai",
      }),
      fetchFn,
    });

    await expect(translate({
      text: "うへ〜、先生。 __CYRENE_PROTECTED_0000__",
      sourceLanguage: "ja",
      targetLanguage: "zh-CN",
      signal: new AbortController().signal,
    })).resolves.toBe("呼啊〜老师。 __CYRENE_PROTECTED_0000__");

    const request = mocks.buildRequest.mock.calls[0][0] as Record<string, unknown>;
    expect(request).toMatchObject({ model: "qwen3.5-9b", stream: false, maxTokens: 1200 });
    expect(request).not.toHaveProperty("tools");
    expect(JSON.stringify(request)).toContain("只输出简体中文译文");
    expect(JSON.stringify(request)).toContain("__CYRENE_PROTECTED_0000__");
    expect(JSON.stringify(request)).toContain("/no_think");
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(mocks.recordUsage).toHaveBeenCalledWith(20, 8, 1);
  });

  it("builds the Translation Pass from the character's declared source language", async () => {
    mocks.parseResponse.mockReturnValue({ text: "Good morning 的中文译文" });
    const translate = createLocalCharacterTranslationProvider({
      getSettings: () => ({
        provider: "local",
        baseUrl: "http://127.0.0.1:8080/v1",
        model: "qwen3.5-9b",
        apiKey: "",
      }),
      fetchFn: vi.fn(async () => new Response("{}", { status: 200 })),
    });

    await translate({
      text: "Good morning, Sensei.",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      signal: new AbortController().signal,
    });

    const request = mocks.buildRequest.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(request)).toContain("源语言标签：en");
    expect(JSON.stringify(request)).not.toContain("日文原文");
  });

  it("refuses cloud endpoints before any translation request is sent", async () => {
    const fetchFn = vi.fn();
    const translate = createLocalCharacterTranslationProvider({
      getSettings: () => ({
        provider: "cloud",
        baseUrl: "https://api.example.com/v1",
        model: "cloud-model",
        apiKey: "secret",
      }),
      fetchFn,
    });

    await expect(translate({
      text: "先生。",
      sourceLanguage: "ja",
      targetLanguage: "zh-CN",
      signal: new AbortController().signal,
    })).rejects.toThrow("翻译只允许使用本机模型服务");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
