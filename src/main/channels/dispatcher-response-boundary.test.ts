import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  appendHistory: vi.fn(),
  appendLog: vi.fn(),
  reloadLogFromDisk: vi.fn(),
  rememberRecipient: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { getAppPath: () => "/tmp/cyrene-dispatcher-response-boundary-app" },
}));
vi.mock("./settings-store", () => ({
  loadChannelsSettings: () => ({
    wechat: { enabled: true },
    feishu: { enabled: false },
    inboundPort: 0,
    sharedSecret: "",
    rateLimitPerUser: 10,
    rateLimitPerChannel: 100,
    ttsEnabled: true,
    stickerEnabled: false,
    mirrorToDesktop: false,
    toolSandbox: "all",
  }),
}));
vi.mock("./message-log", () => ({
  appendLog: mocks.appendLog,
  reloadLogFromDisk: mocks.reloadLogFromDisk,
}));
vi.mock("./history-log", () => ({ appendHistory: mocks.appendHistory }));
vi.mock("./proactive-delivery", () => ({ rememberProactiveChannelRecipient: mocks.rememberRecipient }));
vi.mock("../sticker-protocol", () => ({ resolveLocalStickerPath: () => null }));
vi.mock("../sticker-storage", () => ({
  getStickersDir: () => "/tmp/cyrene-dispatcher-response-boundary-stickers",
  loadUserStickerManifest: () => ({}),
}));

import { ChannelDispatcher } from "./dispatcher";

const capability = {
  text: true,
  image: true,
  audio: true,
  file: true,
  video: true,
  markdown: true,
  card: true,
  sticker: true,
  maxTextLength: 4000,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("ChannelDispatcher character response boundary", () => {
  it("sends the original immediately, then delivers a non-speech translation annotation without polluting TTS, log or history", async () => {
    const japaneseOriginal = "おやすみなさい、先生。";
    const chineseAnnotation = "晚安，老师。";
    let resolveTranslation!: () => void;
    const translation = new Promise<{
      characterId: string;
      original: { text: string; language: string };
      translation: { status: "ready"; text: string; targetLanguage: "zh-CN" };
    }>((resolve) => {
      resolveTranslation = () => resolve({
        characterId: "local.hoshino",
        original: { text: japaneseOriginal, language: "ja" },
        translation: { status: "ready", text: chineseAnnotation, targetLanguage: "zh-CN" },
      });
    });
    const synthesizeTts = vi.fn(async () => null);
    const adapterSend = vi.fn(async () => ({ ok: true }));
    const manager = {
      getAdapter: () => ({ capability, send: adapterSend }),
    };
    const dispatcher = new ChannelDispatcher({
      manager: manager as never,
      buildAndRunAgent: async () => ({
        text: japaneseOriginal,
        sticker: null,
      }),
      characterResponse: {
        getStatus: () => ({ enabled: true, characterId: "local.hoshino", targetLanguage: "zh-CN" }),
        complete: async () => translation,
      },
      synthesizeTts,
      loadGeneralSettings: () => ({ mobileMessageSegmentation: "off" as const }),
    });

    const dispatch = await dispatcher.handleIncoming({
      channel: "wechat",
      senderId: "wx-user",
      chatId: "wx-user",
      text: "晚安",
      at: new Date("2026-07-19T00:00:00.000Z"),
    });

    expect(synthesizeTts).toHaveBeenCalledWith(japaneseOriginal, { channel: "wechat" });
    expect(mocks.appendHistory).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^channel:wechat:/),
      "assistant",
      japaneseOriginal,
    );
    expect(mocks.appendLog).toHaveBeenNthCalledWith(2, expect.objectContaining({
      dir: "outgoing",
      text: japaneseOriginal,
    }));
    expect(JSON.stringify(mocks.appendHistory.mock.calls)).not.toContain(chineseAnnotation);
    expect(JSON.stringify(mocks.appendLog.mock.calls)).not.toContain(chineseAnnotation);
    expect(dispatch?.message.parts).toEqual([
      { kind: "text", text: japaneseOriginal },
    ]);
    expect(adapterSend).not.toHaveBeenCalled();

    const afterDelivery = dispatch?.afterDelivery?.(true);
    expect(adapterSend).not.toHaveBeenCalled();
    resolveTranslation();
    await afterDelivery;

    expect(adapterSend).toHaveBeenCalledWith({
      channel: "wechat",
      targetId: "wx-user",
      parts: [{
        kind: "text",
        text: "── 中文译文（仅供理解，非角色发言）──\n晚安，老师。",
      }],
    });
    expect(mocks.appendHistory).toHaveBeenCalledTimes(2);
    expect(mocks.appendLog).toHaveBeenCalledTimes(2);
  });

  it("drops a delayed annotation if the Active Character changes after the original was sent", async () => {
    let activeCharacterId = "local.hoshino";
    let resolveTranslation!: () => void;
    const translation = new Promise<{
      characterId: string;
      original: { text: string; language: string };
      translation: { status: "ready"; text: string; targetLanguage: "zh-CN" };
    }>((resolve) => {
      resolveTranslation = () => resolve({
        characterId: "local.hoshino",
        original: { text: "おやすみなさい、先生。", language: "ja" },
        translation: { status: "ready", text: "晚安，老师。", targetLanguage: "zh-CN" },
      });
    });
    const adapterSend = vi.fn(async () => ({ ok: true }));
    const dispatcher = new ChannelDispatcher({
      manager: {
        getAdapter: () => ({ capability, send: adapterSend }),
      } as never,
      buildAndRunAgent: async () => ({ text: "おやすみなさい、先生。", sticker: null }),
      characterResponse: {
        getStatus: () => ({ enabled: true, characterId: activeCharacterId, targetLanguage: "zh-CN" }),
        complete: async () => translation,
      },
      loadGeneralSettings: () => ({ mobileMessageSegmentation: "off" as const }),
    });

    const dispatch = await dispatcher.handleIncoming({
      channel: "wechat",
      senderId: "wx-user",
      chatId: "wx-user",
      text: "晚安",
      at: new Date("2026-07-19T00:00:00.000Z"),
    });
    const afterDelivery = dispatch?.afterDelivery?.(true);
    activeCharacterId = "local.lumen";
    resolveTranslation();
    await afterDelivery;

    expect(adapterSend).not.toHaveBeenCalled();
  });

  it("drops an annotation returned for a different character", async () => {
    const adapterSend = vi.fn(async () => ({ ok: true }));
    const dispatcher = new ChannelDispatcher({
      manager: {
        getAdapter: () => ({ capability, send: adapterSend }),
      } as never,
      buildAndRunAgent: async () => ({ text: "おやすみなさい、先生。", sticker: null }),
      characterResponse: {
        getStatus: () => ({ enabled: true, characterId: "local.hoshino", targetLanguage: "zh-CN" as const }),
        complete: async () => ({
          characterId: "local.lumen",
          original: { text: "おやすみなさい、先生。", language: "ja" },
          translation: { status: "ready" as const, text: "晚安，老师。", targetLanguage: "zh-CN" as const },
        }),
      },
      loadGeneralSettings: () => ({ mobileMessageSegmentation: "off" as const }),
    });

    const dispatch = await dispatcher.handleIncoming({
      channel: "wechat",
      senderId: "wx-user",
      chatId: "wx-user",
      text: "晚安",
      at: new Date("2026-07-19T00:00:00.000Z"),
    });
    await dispatch?.afterDelivery?.(true);

    expect(adapterSend).not.toHaveBeenCalled();
  });

  it("cancels an unfinished annotation when a newer turn for the same channel conversation begins", async () => {
    const japaneseOriginal = "おやすみなさい、先生。";
    let resolveTranslation!: () => void;
    let translationSignal: AbortSignal | undefined;
    const translation = new Promise<{
      characterId: string;
      original: { text: string; language: string };
      translation: { status: "ready"; text: string; targetLanguage: "zh-CN" };
    }>((resolve) => {
      resolveTranslation = () => resolve({
        characterId: "local.hoshino",
        original: { text: japaneseOriginal, language: "ja" },
        translation: { status: "ready", text: "晚安，老师。", targetLanguage: "zh-CN" },
      });
    });
    const adapterSend = vi.fn(async () => ({ ok: true }));
    const getStatus = vi.fn(() => ({
      enabled: true,
      characterId: "local.hoshino",
      targetLanguage: "zh-CN" as const,
    }));
    const complete = vi.fn(async (_original: string, signal?: AbortSignal) => {
      translationSignal = signal;
      return translation;
    });
    const dispatcher = new ChannelDispatcher({
      manager: {
        getAdapter: () => ({ capability, send: adapterSend }),
      } as never,
      buildAndRunAgent: async () => ({ text: japaneseOriginal, sticker: null }),
      characterResponse: { getStatus, complete },
      loadGeneralSettings: () => ({ mobileMessageSegmentation: "off" as const }),
    });
    const first = await dispatcher.handleIncoming({
      channel: "wechat",
      senderId: "wx-user",
      chatId: "wx-user",
      text: "晚安",
      at: new Date("2026-07-19T00:00:00.000Z"),
    });

    const firstAfterDelivery = first?.afterDelivery?.(true);
    await Promise.resolve();
    expect(first?.afterDelivery).toEqual(expect.any(Function));
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(translationSignal?.aborted).toBe(false);

    await dispatcher.handleIncoming({
      channel: "wechat",
      senderId: "wx-user",
      chatId: "wx-user",
      text: "明天见",
      at: new Date("2026-07-19T00:00:01.000Z"),
    });
    expect(translationSignal?.aborted).toBe(true);

    resolveTranslation();
    await firstAfterDelivery;
    expect(adapterSend).not.toHaveBeenCalled();
  });
});
