import { describe, expect, it, vi } from "vitest";
import {
  deleteArchivedCharacterState,
  getCharacterSettingsSnapshot,
  listArchivedCharacterStates,
  requestCharacterSwitch,
  uninstallCharacterPackage,
  updateCharacterResponseSettings,
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
      getActiveResponseSettings: () => ({
        characterId: "local.hoshino",
        language: "ja",
        translation: { status: "available" as const, targetLanguage: "zh-CN" as const, enabled: false },
      }),
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
      responseSettings: {
        characterId: "local.hoshino",
        language: "ja",
        translation: { status: "available", targetLanguage: "zh-CN", enabled: false },
      },
    });
  });

  it("validates and delegates the active character Translation Overlay choice", () => {
    const updateActiveResponseSettings = vi.fn().mockReturnValue({
      characterId: "local.hoshino",
      language: "ja",
      translation: { status: "available", targetLanguage: "zh-CN", enabled: true },
    });

    expect(() => updateCharacterResponseSettings(
      { updateActiveResponseSettings },
      { translationEnabled: "yes" },
    )).toThrow("角色回复设置格式无效");
    expect(updateCharacterResponseSettings(
      { updateActiveResponseSettings },
      { translationEnabled: true },
    )).toMatchObject({ translation: { enabled: true } });
    expect(updateActiveResponseSettings).toHaveBeenCalledOnce();
    expect(updateActiveResponseSettings).toHaveBeenCalledWith({ translationEnabled: true });
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

  it("validates lifecycle ids and delegates archive operations", async () => {
    const runtime = {
      getSnapshot: vi.fn(),
      getBlockingActivities: vi.fn(),
      requestSwitch: vi.fn(),
      uninstallPackage: vi.fn().mockResolvedValue({ ok: true }),
      listArchivedCharacterStates: vi.fn().mockResolvedValue([{ characterId: "fixture.lumen" }]),
      permanentlyDeleteArchivedState: vi.fn().mockResolvedValue({ ok: true }),
    };

    expect(() => uninstallCharacterPackage(runtime, "../lumen")).toThrow("角色 ID 格式无效");
    expect(() => uninstallCharacterPackage(runtime, "fixture..lumen")).toThrow("角色 ID 格式无效");
    await expect(uninstallCharacterPackage(runtime, "x")).resolves.toEqual({ ok: true });
    await expect(uninstallCharacterPackage(runtime, "fixture.lumen")).resolves.toEqual({ ok: true });
    await expect(listArchivedCharacterStates(runtime)).resolves.toEqual([{ characterId: "fixture.lumen" }]);
    expect(() => deleteArchivedCharacterState(runtime, "fixture.lumen", 123)).toThrow("永久删除确认格式无效");
    await expect(deleteArchivedCharacterState(runtime, "fixture.lumen", "fixture.lumen")).resolves.toEqual({ ok: true });
  });
});
