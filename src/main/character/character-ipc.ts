import { BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import { IPC } from "../../shared/ipc-channels";
import type { CharacterRuntime } from "./character-runtime";
import { getActiveCharacterPublicIdentity } from "./active-character";

function requireCharacterId(characterId: unknown): string {
  if (
    typeof characterId !== "string"
    || characterId.length > 64
    || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(characterId)
  ) {
    throw new Error("角色 ID 格式无效");
  }
  return characterId;
}

export function getCharacterSettingsSnapshot(
  runtime: Pick<CharacterRuntime, "getSnapshot" | "getBlockingActivities">,
) {
  return {
    ...runtime.getSnapshot(),
    switching: {
      blockingActivities: runtime.getBlockingActivities(),
    },
  };
}

export function requestCharacterSwitch(
  runtime: Pick<CharacterRuntime, "requestSwitch">,
  characterId: unknown,
) {
  return runtime.requestSwitch(requireCharacterId(characterId));
}

export function requestCoordinatedCharacterSwitch(
  runtime: Pick<CharacterRuntime, "requestSwitch">,
  characterId: unknown,
  coordinate: (
    operation: () => ReturnType<CharacterRuntime["requestSwitch"]>,
  ) => ReturnType<CharacterRuntime["requestSwitch"]>,
) {
  const validCharacterId = requireCharacterId(characterId);
  return coordinate(() => runtime.requestSwitch(validCharacterId));
}

export function uninstallCharacterPackage(
  runtime: Pick<CharacterRuntime, "uninstallPackage">,
  characterId: unknown,
) {
  return runtime.uninstallPackage(requireCharacterId(characterId));
}

export function listArchivedCharacterStates(
  runtime: Pick<CharacterRuntime, "listArchivedCharacterStates">,
) {
  return runtime.listArchivedCharacterStates();
}

export function deleteArchivedCharacterState(
  runtime: Pick<CharacterRuntime, "permanentlyDeleteArchivedState">,
  characterId: unknown,
  confirmationCharacterId: unknown,
) {
  const validCharacterId = requireCharacterId(characterId);
  if (typeof confirmationCharacterId !== "string") {
    throw new Error("永久删除确认格式无效");
  }
  return runtime.permanentlyDeleteArchivedState(validCharacterId, confirmationCharacterId);
}

export function registerCharacterIpc(deps: {
  getRuntime: () => CharacterRuntime | null;
  getSettingsWindow: () => BrowserWindow | null;
  coordinateSwitch?: (
    operation: () => ReturnType<CharacterRuntime["requestSwitch"]>,
  ) => ReturnType<CharacterRuntime["requestSwitch"]>;
}): void {
  ipcMain.handle(IPC.CHARACTER_LIST, () => {
    const runtime = deps.getRuntime();
    if (!runtime) throw new Error("角色运行时尚未就绪");
    return getCharacterSettingsSnapshot(runtime);
  });

  ipcMain.handle(IPC.CHARACTER_ACTIVE_GET, () => getActiveCharacterPublicIdentity());

  ipcMain.handle(IPC.CHARACTER_PICK_IMPORT_FOLDER, async () => {
    const options: Electron.OpenDialogOptions = {
      title: "选择角色包文件夹",
      properties: ["openDirectory"],
    };
    const settingsWindow = deps.getSettingsWindow();
    const result = settingsWindow
      ? await dialog.showOpenDialog(settingsWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle(IPC.CHARACTER_IMPORT, async (_event, sourcePath: unknown, confirmReplacement: unknown) => {
    const runtime = deps.getRuntime();
    if (!runtime) throw new Error("角色运行时尚未就绪");
    if (typeof sourcePath !== "string" || !sourcePath.trim() || !path.isAbsolute(sourcePath)) {
      throw new Error("角色包路径必须是有效的绝对路径");
    }
    return runtime.importPackage(sourcePath, { confirmReplacement: confirmReplacement === true });
  });

  ipcMain.handle(IPC.CHARACTER_SWITCH, async (_event, characterId: unknown) => {
    const runtime = deps.getRuntime();
    if (!runtime) throw new Error("角色运行时尚未就绪");
    return deps.coordinateSwitch
      ? requestCoordinatedCharacterSwitch(runtime, characterId, deps.coordinateSwitch)
      : requestCharacterSwitch(runtime, characterId);
  });

  ipcMain.handle(IPC.CHARACTER_UNINSTALL, async (_event, characterId: unknown) => {
    const runtime = deps.getRuntime();
    if (!runtime) throw new Error("角色运行时尚未就绪");
    return uninstallCharacterPackage(runtime, characterId);
  });

  ipcMain.handle(IPC.CHARACTER_ARCHIVE_LIST, async () => {
    const runtime = deps.getRuntime();
    if (!runtime) throw new Error("角色运行时尚未就绪");
    return listArchivedCharacterStates(runtime);
  });

  ipcMain.handle(IPC.CHARACTER_ARCHIVE_DELETE, async (
    _event,
    characterId: unknown,
    confirmationCharacterId: unknown,
  ) => {
    const runtime = deps.getRuntime();
    if (!runtime) throw new Error("角色运行时尚未就绪");
    return deleteArchivedCharacterState(runtime, characterId, confirmationCharacterId);
  });
}
