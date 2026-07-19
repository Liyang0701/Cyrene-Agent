import { describe, expect, it, vi } from "vitest";
import { ChannelManager } from "./manager";
import type { ChannelAdapter } from "./adapters/base";
import type { ChannelCapability, IncomingMessage, OutgoingMessage } from "./types";

const capability: ChannelCapability = {
  text: true,
  image: true,
  audio: true,
  file: true,
  video: true,
  markdown: true,
  card: true,
  sticker: true,
  maxTextLength: 4_000,
};

function createAdapter(): ChannelAdapter {
  return {
    id: "wechat",
    displayName: "test",
    capability,
    onMessage: null,
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    send: vi.fn(async () => ({ ok: true })),
    getStatus: () => ({ enabled: true, phase: "running" as const }),
  };
}

const incoming: IncomingMessage = {
  channel: "wechat",
  senderId: "wx-user",
  chatId: "wx-user",
  text: "晚安",
  at: new Date("2026-07-19T00:00:00.000Z"),
};

describe("ChannelManager delivery boundary", () => {
  it("sends the original before starting a non-blocking post-delivery annotation", async () => {
    const manager = new ChannelManager();
    const adapter = createAdapter();
    const original: OutgoingMessage = {
      channel: "wechat",
      targetId: "wx-user",
      parts: [{ kind: "text", text: "おやすみなさい、先生。" }],
    };
    let releaseAfterDelivery!: () => void;
    const afterDelivery = vi.fn(() => new Promise<void>((resolve) => {
      releaseAfterDelivery = resolve;
    }));

    manager.register(adapter);
    manager.setDispatcher(async () => ({ message: original, afterDelivery }));
    await manager.startAll();

    const result = await adapter.onMessage!(incoming);

    expect(result).toEqual(original);
    expect(adapter.send).toHaveBeenCalledWith(original);
    expect(afterDelivery).toHaveBeenCalledWith(true);
    releaseAfterDelivery();
  });
});
