import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: {
    wechat: { enabled: false },
    feishu: { enabled: false },
  },
}));

vi.mock("electron", () => ({ app: { getPath: () => "/tmp/cyrene-wechat-lifecycle" } }));
vi.mock("../../settings-store", () => ({
  loadChannelsSettings: () => mocks.settings,
  saveChannelsSettings: (patch: { wechat?: { enabled?: boolean } }) => {
    if (typeof patch.wechat?.enabled === "boolean") mocks.settings.wechat.enabled = patch.wechat.enabled;
    return mocks.settings;
  },
}));

import { ILinkBotAdapter } from "./ilink-bot-adapter";

describe("ILinkBotAdapter lifecycle respects channel config", () => {
  beforeEach(() => {
    mocks.settings.wechat.enabled = false;
  });

  it("stays offline when WeChat is disabled", async () => {
    const adapter = new ILinkBotAdapter();
    await adapter.start();
    expect(adapter.getStatus()).toEqual({ enabled: false, phase: "offline", message: "未启用" });
  });

  it("does not expose a stale running state after the config is disabled", () => {
    const adapter = new ILinkBotAdapter();
    (adapter as any).status = { enabled: true, phase: "running", message: "微信已连接" };
    expect(adapter.getStatus()).toEqual({ enabled: false, phase: "offline", message: "未启用" });
  });
});
