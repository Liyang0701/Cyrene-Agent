import type { CharacterRuntime } from "./character-runtime";

type CharacterIpcRuntime = Pick<
  CharacterRuntime,
  "getSnapshot" | "getBlockingActivities" | "requestSwitch"
>;

export function getCharacterSettingsSnapshot(runtime: CharacterIpcRuntime) {
  return {
    ...runtime.getSnapshot(),
    switching: {
      blockingActivities: runtime.getBlockingActivities(),
    },
  };
}

export function requestCharacterSwitch(runtime: CharacterIpcRuntime, characterId: unknown) {
  if (typeof characterId !== "string" || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(characterId)) {
    throw new Error("角色 ID 格式无效");
  }
  return runtime.requestSwitch(characterId);
}
