import { describe, expect, it, vi } from "vitest";
import {
  getCharacterSettingsSnapshot,
  requestCharacterSwitch,
} from "./character-ipc";

describe("character IPC boundary", () => {
  it("returns runtime state and the same live blockers used by switching", () => {
    const runtime = {
      getSnapshot: () => ({
        status: "ready" as const,
        activeCharacter: null,
        packages: [],
        diagnostics: [],
      }),
      getBlockingActivities: () => [{ kind: "voice-call" as const, reason: "语音通话正在进行" }],
      requestSwitch: vi.fn(),
    };

    expect(getCharacterSettingsSnapshot(runtime)).toEqual({
      status: "ready",
      activeCharacter: null,
      packages: [],
      diagnostics: [],
      switching: {
        blockingActivities: [{ kind: "voice-call", reason: "语音通话正在进行" }],
      },
    });
  });

  it("validates the target id before delegating to CharacterRuntime", async () => {
    const requestSwitch = vi.fn().mockResolvedValue({ ok: true, status: "relaunch-requested" });
    const runtime = {
      getSnapshot: vi.fn(),
      getBlockingActivities: vi.fn(),
      requestSwitch,
    };

    expect(() => requestCharacterSwitch(runtime, "../cyrene")).toThrow("角色 ID 格式无效");
    await expect(requestCharacterSwitch(runtime, "fixture.lumen")).resolves.toEqual({
      ok: true,
      status: "relaunch-requested",
    });
    expect(requestSwitch).toHaveBeenCalledOnce();
    expect(requestSwitch).toHaveBeenCalledWith("fixture.lumen");
  });
});
