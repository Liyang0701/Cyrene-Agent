import { describe, expect, it, vi } from "vitest";
import { Observable } from "rxjs";
import { IPC } from "../shared/ipc-channels";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

vi.mock("./orchestrator/cyrene-agent", () => ({
  CyreneAgent: class {
    threadId: string;
    lastResult?: { reply: string; toolResults: unknown[] };

    constructor(input: { threadId: string }) {
      this.threadId = input.threadId;
    }

    runWithEvents() {
      return new Observable((subscriber) => {
        this.lastResult = { reply: "抱抱你", toolResults: [] };
        subscriber.next({ type: "RUN_STARTED" });
        subscriber.next({ type: "RUN_FINISHED" });
        subscriber.complete();
      });
    }
  },
}));

vi.mock("./orchestrator/history-tools", () => ({
  indexConversationTurn: vi.fn(),
}));

describe("agui-bridge sticker event ordering", () => {
  it("delivers sticker side effects before RUN_FINISHED so renderer keeps listening", async () => {
    vi.resetModules();
    mocks.handlers.clear();
    const { registerAgUiIpc } = await import("./agui-bridge");
    const sent: unknown[] = [];
    const sender = {
      isDestroyed: () => false,
      send: (_channel: string, event: unknown) => {
        sent.push(event);
      },
    };

    registerAgUiIpc(
      async () => ({
        options: {
          settings: { provider: "test", baseUrl: "", model: "", apiKey: "" },
          messages: [],
          timeoutMs: 1000,
          toolSystemContent: "TOOL",
          soulSystemBaseContent: "SOUL",
        },
        latestUserText: "累了",
      }),
      async () => {
        sender.send(IPC.AGUI_EVENT, {
          type: "CUSTOM",
          name: "cyrene.sticker",
          value: "hugtight",
        });
      },
      () => null,
    );

    const handler = mocks.handlers.get(IPC.AGUI_RUN);
    if (!handler) throw new Error("AGUI_RUN handler was not registered");
    await handler({ sender }, { messages: [{ role: "user", content: "累了" }], style: "01_default.md" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const eventTypes = sent.map((event) => (event as { type?: string; name?: string }).name ?? (event as { type?: string }).type);
    expect(eventTypes).toEqual(["RUN_STARTED", "cyrene.sticker", "RUN_FINISHED"]);
  });

  it("finishes original-response side effects before publishing an asynchronous Translation Overlay", async () => {
    vi.resetModules();
    mocks.handlers.clear();
    const { registerAgUiIpc } = await import("./agui-bridge");
    const sent: unknown[] = [];
    const sender = {
      isDestroyed: () => false,
      send: (_channel: string, event: unknown) => sent.push(event),
    };
    const order: string[] = [];
    let finishTranslation!: () => void;
    const translationDone = new Promise<{
      characterId: string;
      original: { text: string; language: string };
      translation: {
        status: "ready";
        text: string;
        targetLanguage: "zh-CN";
        cache: "miss";
      };
    }>((resolve) => {
      finishTranslation = () => resolve({
        characterId: "local.hoshino",
        original: { text: "抱抱你", language: "ja" },
        translation: {
          status: "ready",
          text: "抱抱你。",
          targetLanguage: "zh-CN",
          cache: "miss",
        },
      });
    });

    registerAgUiIpc(
      async () => ({
        options: {
          settings: { provider: "test", baseUrl: "", model: "", apiKey: "" },
          messages: [],
          timeoutMs: 1000,
          toolSystemContent: "TOOL",
          soulSystemBaseContent: "SOUL",
        },
        latestUserText: "累了",
      }),
      async () => { order.push("original-side-effects"); },
      () => null,
      undefined,
      {
        getStatus: () => ({ enabled: true, characterId: "local.hoshino", targetLanguage: "zh-CN" }),
        complete: async (originalText: string) => {
          order.push(`translate:${originalText}`);
          return translationDone;
        },
      },
    );

    const handler = mocks.handlers.get(IPC.AGUI_RUN);
    if (!handler) throw new Error("AGUI_RUN handler was not registered");
    await handler({ sender }, { messages: [{ role: "user", content: "累了" }], style: "01_default.md" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(order).toEqual(["original-side-effects", "translate:抱抱你"]);
    expect(sent.map((event) => (
      (event as { name?: string }).name ?? (event as { type?: string }).type
    ))).toEqual([
      "RUN_STARTED",
      "character.translation.started",
      "RUN_FINISHED",
    ]);

    finishTranslation();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent.map((event) => (
      (event as { name?: string }).name ?? (event as { type?: string }).type
    ))).toEqual([
      "RUN_STARTED",
      "character.translation.started",
      "RUN_FINISHED",
      "character.translation.ready",
    ]);
    expect(sent[3]).toMatchObject({
      type: "CUSTOM",
      name: "character.translation.ready",
      value: {
        original: { text: "抱抱你", language: "ja" },
        translation: { text: "抱抱你。" },
      },
    });
  });

  it("resolves a started overlay when translation is disabled before its asynchronous pass finishes", async () => {
    vi.resetModules();
    mocks.handlers.clear();
    const { registerAgUiIpc } = await import("./agui-bridge");
    const sent: unknown[] = [];
    const sender = {
      isDestroyed: () => false,
      send: (_channel: string, event: unknown) => sent.push(event),
    };

    registerAgUiIpc(
      async () => ({
        options: {
          settings: { provider: "test", baseUrl: "", model: "", apiKey: "" },
          messages: [],
          timeoutMs: 1000,
          toolSystemContent: "TOOL",
          soulSystemBaseContent: "SOUL",
        },
        latestUserText: "累了",
      }),
      async () => {},
      () => null,
      undefined,
      {
        getStatus: () => ({ enabled: true, characterId: "local.hoshino", targetLanguage: "zh-CN" }),
        complete: async () => ({
          characterId: "local.hoshino",
          original: { text: "抱抱你", language: "ja" },
        }),
      },
    );

    const handler = mocks.handlers.get(IPC.AGUI_RUN);
    if (!handler) throw new Error("AGUI_RUN handler was not registered");
    await handler({ sender }, { messages: [{ role: "user", content: "累了" }], style: "01_default.md" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sent.map((event) => (
      (event as { name?: string }).name ?? (event as { type?: string }).type
    ))).toEqual([
      "RUN_STARTED",
      "character.translation.started",
      "RUN_FINISHED",
      "character.translation.failed",
    ]);
    expect(sent[3]).toMatchObject({
      name: "character.translation.failed",
      value: {
        translation: {
          status: "failed",
          code: "cancelled",
          message: "翻译已关闭",
        },
      },
    });
  });

  it("does not publish a ready overlay from a character that changed during the Translation Pass", async () => {
    vi.resetModules();
    mocks.handlers.clear();
    const { registerAgUiIpc } = await import("./agui-bridge");
    const sent: unknown[] = [];
    let activeCharacterId = "local.hoshino";
    let finishTranslation!: () => void;
    const translationDone = new Promise<{
      characterId: string;
      original: { text: string; language: string };
      translation: { status: "ready"; text: string; targetLanguage: "zh-CN" };
    }>((resolve) => {
      finishTranslation = () => resolve({
        characterId: "local.hoshino",
        original: { text: "抱抱你", language: "ja" },
        translation: { status: "ready", text: "抱抱你。", targetLanguage: "zh-CN" },
      });
    });
    const sender = {
      isDestroyed: () => false,
      send: (_channel: string, event: unknown) => sent.push(event),
    };

    registerAgUiIpc(
      async () => ({
        options: {
          settings: { provider: "test", baseUrl: "", model: "", apiKey: "" },
          messages: [],
          timeoutMs: 1000,
          toolSystemContent: "TOOL",
          soulSystemBaseContent: "SOUL",
        },
        latestUserText: "累了",
      }),
      async () => {},
      () => null,
      undefined,
      {
        getStatus: () => ({ enabled: true, characterId: activeCharacterId, targetLanguage: "zh-CN" as const }),
        complete: async () => translationDone,
      },
    );

    const handler = mocks.handlers.get(IPC.AGUI_RUN);
    if (!handler) throw new Error("AGUI_RUN handler was not registered");
    await handler({ sender }, { messages: [{ role: "user", content: "累了" }], style: "01_default.md" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    activeCharacterId = "local.lumen";
    finishTranslation();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const names = sent.map((event) => (
      (event as { name?: string }).name ?? (event as { type?: string }).type
    ));
    expect(names).toEqual([
      "RUN_STARTED",
      "character.translation.started",
      "RUN_FINISHED",
      "character.translation.failed",
    ]);
    expect(sent.at(-1)).toMatchObject({
      name: "character.translation.failed",
      value: { translation: { status: "failed", code: "cancelled" } },
    });
  });
});
