import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  createCharacterRuntime,
  type CharacterPackageManifest,
} from "./character-runtime";

function createCharacterPackage(rawResponse: unknown, id = "fixture.response-language"): Readonly<{
  root: string;
  manifest: CharacterPackageManifest;
}> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "character-response-runtime-"));
  fs.mkdirSync(path.join(root, "content"), { recursive: true });
  fs.writeFileSync(path.join(root, "content", "identity.md"), "# Identity\n");
  fs.writeFileSync(path.join(root, "content", "soul.md"), "# Soul\n");
  fs.writeFileSync(path.join(root, "avatar.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');

  const manifest = {
    schemaVersion: 1,
    id,
    version: "1.0.0",
    displayName: "响应语言测试角色",
    distributionStatus: "redistributable",
    compatibility: { minimumAppVersion: "0.1.0" },
    assetProvenance: [{
      assetClass: "character-content",
      source: "CharacterRuntime 自动化测试原创内容",
      license: "MIT",
      distributionStatus: "redistributable",
    }],
    content: {
      identity: "content/identity.md",
      soul: "content/soul.md",
      avatar: "avatar.svg",
    },
    response: rawResponse,
  } as unknown as CharacterPackageManifest;

  return { root, manifest };
}

describe("CharacterRuntime response declaration", () => {
  it("exposes the declared Character Response Language and Translation Overlay capability", async () => {
    const fixture = createCharacterPackage({
      language: "ja",
      translation: { targetLanguage: "zh-CN" },
    });
    const runtime = createCharacterRuntime({
      userDataRoot: fs.mkdtempSync(path.join(os.tmpdir(), "character-response-state-")),
      activeCharacterId: fixture.manifest.id,
      packages: [{ source: "builtin", rootPath: fixture.root, manifest: fixture.manifest }],
    });

    const snapshot = await runtime.initialize();

    expect(snapshot).toMatchObject({
      status: "ready",
      activeCharacter: {
        id: "fixture.response-language",
        response: {
          language: "ja",
          translation: {
            status: "available",
            targetLanguage: "zh-CN",
          },
        },
      },
    });
    expect(Object.isFrozen(snapshot.activeCharacter?.response)).toBe(true);
    expect(Object.isFrozen(snapshot.activeCharacter?.response.translation)).toBe(true);
  });

  it("rejects a malformed Character Response Language instead of activating the package", async () => {
    const fixture = createCharacterPackage({ language: "ja_JP" });
    const runtime = createCharacterRuntime({
      userDataRoot: fs.mkdtempSync(path.join(os.tmpdir(), "character-response-invalid-")),
      activeCharacterId: fixture.manifest.id,
      packages: [{ source: "builtin", rootPath: fixture.root, manifest: fixture.manifest }],
    });

    const snapshot = await runtime.initialize();

    expect(snapshot).toMatchObject({
      status: "failed",
      activeCharacter: null,
      diagnostics: [{
        code: "character.manifest.invalid_field",
        characterId: "fixture.response-language",
        field: "response.language",
      }],
    });
  });

  it("rejects unsupported Translation Overlay declarations", async () => {
    const fixture = createCharacterPackage({
      language: "ja",
      translation: { targetLanguage: "en" },
    });
    const runtime = createCharacterRuntime({
      userDataRoot: fs.mkdtempSync(path.join(os.tmpdir(), "character-response-translation-invalid-")),
      activeCharacterId: fixture.manifest.id,
      packages: [{ source: "builtin", rootPath: fixture.root, manifest: fixture.manifest }],
    });

    const snapshot = await runtime.initialize();

    expect(snapshot).toMatchObject({
      status: "failed",
      diagnostics: [{
        code: "character.manifest.invalid_field",
        characterId: "fixture.response-language",
        field: "response.translation.targetLanguage",
      }],
    });
  });

  it("keeps Translation Overlay disabled by default and restores the per-character choice after restart", async () => {
    const fixture = createCharacterPackage({
      language: "ja",
      translation: { targetLanguage: "zh-CN" },
    });
    const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-response-preferences-"));
    const createRuntime = () => createCharacterRuntime({
      userDataRoot,
      activeCharacterId: fixture.manifest.id,
      packages: [{ source: "builtin" as const, rootPath: fixture.root, manifest: fixture.manifest }],
    });
    const runtime = createRuntime();
    await runtime.initialize();

    expect(runtime.getActiveResponseSettings()).toEqual({
      characterId: fixture.manifest.id,
      language: "ja",
      translation: {
        status: "available",
        targetLanguage: "zh-CN",
        enabled: false,
      },
    });

    expect(runtime.updateActiveResponseSettings({ translationEnabled: true })).toMatchObject({
      translation: { status: "available", enabled: true },
    });

    const restartedRuntime = createRuntime();
    await restartedRuntime.initialize();
    expect(restartedRuntime.getActiveResponseSettings()).toMatchObject({
      characterId: fixture.manifest.id,
      translation: { status: "available", enabled: true },
    });
  });

  it("does not leak Hoshino's Translation Overlay choice into another Character ID", async () => {
    const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-response-isolation-"));
    const hoshino = createCharacterPackage({
      language: "ja",
      translation: { targetLanguage: "zh-CN" },
    }, "local.hoshino");
    const lumen = createCharacterPackage({
      language: "ja",
      translation: { targetLanguage: "zh-CN" },
    }, "fixture.lumen");
    const hoshinoRuntime = createCharacterRuntime({
      userDataRoot,
      activeCharacterId: hoshino.manifest.id,
      packages: [{ source: "builtin", rootPath: hoshino.root, manifest: hoshino.manifest }],
    });
    await hoshinoRuntime.initialize();
    hoshinoRuntime.updateActiveResponseSettings({ translationEnabled: true });

    const lumenRuntime = createCharacterRuntime({
      userDataRoot,
      activeCharacterId: lumen.manifest.id,
      packages: [{ source: "builtin", rootPath: lumen.root, manifest: lumen.manifest }],
    });
    await lumenRuntime.initialize();

    expect(lumenRuntime.getActiveResponseSettings()).toMatchObject({
      characterId: "fixture.lumen",
      translation: { status: "available", enabled: false },
    });
  });
});
