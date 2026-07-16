import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  createCharacterRuntime,
  createDefaultCharacterRuntime,
  type CharacterPackageManifest,
} from "./character-runtime";

const TEST_PACKAGE_METADATA = {
  compatibility: { minimumAppVersion: "0.1.0" },
  assetProvenance: [{
    assetClass: "character-content",
    source: "CharacterRuntime 自动化测试原创内容",
    license: "MIT",
    distributionStatus: "redistributable",
  }],
} as const;

describe("CharacterRuntime", () => {
  it("initializes the built-in Cyrene package as one immutable Active Character", async () => {
    const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-runtime-"));
    const appRoot = process.cwd();
    const runtime = createDefaultCharacterRuntime({ appRoot, userDataRoot });

    const snapshot = await runtime.initialize();

    expect(snapshot).toMatchObject({
      status: "ready",
      diagnostics: [],
      activeCharacter: {
        id: "cyrene",
        displayName: "昔涟",
        source: "builtin",
        readOnly: true,
        distributionStatus: "redistributable",
        content: {
          identityPath: path.join(appRoot, "prompts", "identity.md"),
          soulPath: path.join(appRoot, "prompts", "soul.md"),
          avatarPath: path.join(appRoot, "assets", "icon-presets", "cyrene-sun.png"),
        },
        stateRoot: path.join(userDataRoot, "characters", "cyrene"),
        capabilities: {
          worldbook: {
            status: "available",
            directoryPath: path.join(appRoot, "prompts", "worldbook"),
          },
          live2d: {
            status: "available",
            modelPath: path.join(appRoot, "assets", "models", "cyrene", "Cyrene.model3.json"),
          },
          semanticActions: { status: "unavailable" },
          voice: { status: "unavailable" },
          stickers: { status: "unavailable" },
          openers: { status: "unavailable" },
        },
      },
    });
    expect(runtime.getSnapshot()).toBe(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.activeCharacter)).toBe(true);
    expect(Object.isFrozen(snapshot.activeCharacter?.content)).toBe(true);
    expect(Object.isFrozen(snapshot.activeCharacter?.capabilities)).toBe(true);
  });

  it("reports an unhealthy package when a required Character Content resource is missing", async () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-package-"));
    const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-runtime-"));
    fs.mkdirSync(path.join(packageRoot, "content"), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "content", "identity.md"), "# Identity\n");
    fs.writeFileSync(path.join(packageRoot, "avatar.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
    const manifest: CharacterPackageManifest = {
      ...TEST_PACKAGE_METADATA,
      schemaVersion: 1,
      id: "fixture.missing-soul",
      version: "1.0.0",
      displayName: "缺少人格资源的测试角色",
      distributionStatus: "redistributable",
      content: {
        identity: "content/identity.md",
        soul: "content/soul.md",
        avatar: "avatar.svg",
      },
    };
    const runtime = createCharacterRuntime({
      userDataRoot,
      activeCharacterId: manifest.id,
      packages: [{ source: "builtin", rootPath: packageRoot, manifest }],
    });

    const snapshot = await runtime.initialize();

    expect(snapshot).toMatchObject({
      status: "failed",
      activeCharacter: null,
      packages: [{
        id: "fixture.missing-soul",
        health: {
          status: "unhealthy",
          diagnostics: [{
            code: "character.core_resource.missing",
            characterId: "fixture.missing-soul",
            field: "content.soul",
            resourcePath: path.join(packageRoot, "content", "soul.md"),
          }],
        },
      }],
      diagnostics: [{
        code: "character.core_resource.missing",
        characterId: "fixture.missing-soul",
        field: "content.soul",
      }],
    });
  });

  it("rejects a declared Character Capability when its resource is invalid", async () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-package-"));
    const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-runtime-"));
    fs.mkdirSync(path.join(packageRoot, "content"), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "content", "identity.md"), "# Identity\n");
    fs.writeFileSync(path.join(packageRoot, "content", "soul.md"), "# Soul\n");
    fs.writeFileSync(path.join(packageRoot, "avatar.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
    const manifest: CharacterPackageManifest = {
      ...TEST_PACKAGE_METADATA,
      schemaVersion: 1,
      id: "fixture.invalid-worldbook",
      version: "1.0.0",
      displayName: "无效世界书测试角色",
      distributionStatus: "redistributable",
      content: {
        identity: "content/identity.md",
        soul: "content/soul.md",
        avatar: "avatar.svg",
      },
      capabilities: {
        worldbook: { directory: "worldbook" },
      },
    };
    const runtime = createCharacterRuntime({
      userDataRoot,
      activeCharacterId: manifest.id,
      packages: [{ source: "builtin", rootPath: packageRoot, manifest }],
    });

    const snapshot = await runtime.initialize();

    expect(snapshot).toMatchObject({
      status: "failed",
      activeCharacter: null,
      diagnostics: [{
        code: "character.capability_resource.missing",
        characterId: "fixture.invalid-worldbook",
        capability: "worldbook",
        field: "capabilities.worldbook.directory",
        resourcePath: path.join(packageRoot, "worldbook"),
      }],
    });
  });

  it("keeps a built-in Character ID reserved when a local package claims the same ID", async () => {
    const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-runtime-"));
    const builtInRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-builtin-"));
    const localRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-local-"));
    for (const root of [builtInRoot, localRoot]) {
      fs.mkdirSync(path.join(root, "content"), { recursive: true });
      fs.writeFileSync(path.join(root, "content", "identity.md"), "# Identity\n");
      fs.writeFileSync(path.join(root, "content", "soul.md"), "# Soul\n");
      fs.writeFileSync(path.join(root, "avatar.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
    }
    const builtInManifest: CharacterPackageManifest = {
      ...TEST_PACKAGE_METADATA,
      schemaVersion: 1,
      id: "cyrene",
      version: "1.0.0",
      displayName: "昔涟",
      distributionStatus: "redistributable",
      content: { identity: "content/identity.md", soul: "content/soul.md", avatar: "avatar.svg" },
    };
    const localManifest: CharacterPackageManifest = {
      ...builtInManifest,
      version: "99.0.0",
      displayName: "伪装的昔涟",
      distributionStatus: "local-only",
    };
    const runtime = createCharacterRuntime({
      userDataRoot,
      activeCharacterId: "cyrene",
      packages: [
        { source: "builtin", rootPath: builtInRoot, manifest: builtInManifest },
        { source: "local", rootPath: localRoot, manifest: localManifest },
      ],
    });

    const snapshot = await runtime.initialize();

    expect(snapshot).toMatchObject({
      status: "ready",
      activeCharacter: {
        id: "cyrene",
        displayName: "昔涟",
        version: "1.0.0",
        source: "builtin",
        packageRoot: builtInRoot,
      },
      packages: [
        { id: "cyrene", source: "builtin", health: { status: "healthy" } },
        {
          id: "cyrene",
          source: "local",
          health: {
            status: "unhealthy",
            diagnostics: [{
              code: "character.id.reserved",
              characterId: "cyrene",
              field: "id",
            }],
          },
        },
      ],
      diagnostics: [{
        code: "character.id.reserved",
        characterId: "cyrene",
        field: "id",
      }],
    });
  });

  it("rejects an unsupported Character Package schema version with a structured diagnostic", async () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-package-"));
    const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-runtime-"));
    fs.mkdirSync(path.join(packageRoot, "content"), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "content", "identity.md"), "# Identity\n");
    fs.writeFileSync(path.join(packageRoot, "content", "soul.md"), "# Soul\n");
    fs.writeFileSync(path.join(packageRoot, "avatar.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
    const manifest = {
      ...TEST_PACKAGE_METADATA,
      schemaVersion: 2,
      id: "fixture.future-schema",
      version: "1.0.0",
      displayName: "未来格式测试角色",
      distributionStatus: "redistributable",
      content: { identity: "content/identity.md", soul: "content/soul.md", avatar: "avatar.svg" },
    } as unknown as CharacterPackageManifest;
    const runtime = createCharacterRuntime({
      userDataRoot,
      activeCharacterId: manifest.id,
      packages: [{ source: "builtin", rootPath: packageRoot, manifest }],
    });

    const snapshot = await runtime.initialize();

    expect(snapshot).toMatchObject({
      status: "failed",
      activeCharacter: null,
      diagnostics: [{
        code: "character.manifest.unsupported_schema",
        characterId: "fixture.future-schema",
        field: "schemaVersion",
      }],
    });
  });

  it("returns manifest field diagnostics instead of crashing on malformed package metadata", async () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-package-"));
    const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-runtime-"));
    fs.writeFileSync(path.join(packageRoot, "avatar.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
    const manifest = {
      ...TEST_PACKAGE_METADATA,
      schemaVersion: 1,
      id: "Unsafe Character ID",
      version: "latest",
      displayName: "   ",
      distributionStatus: "public",
      content: {
        identity: "",
        soul: 42,
        avatar: "avatar.svg",
      },
    } as unknown as CharacterPackageManifest;
    const runtime = createCharacterRuntime({
      userDataRoot,
      activeCharacterId: "Unsafe Character ID",
      packages: [{ source: "builtin", rootPath: packageRoot, manifest }],
    });

    const snapshot = await runtime.initialize();

    expect(snapshot.status).toBe("failed");
    expect(snapshot.activeCharacter).toBeNull();
    expect(snapshot.diagnostics.map(({ code, field }) => ({ code, field }))).toEqual([
      { code: "character.manifest.invalid_field", field: "id" },
      { code: "character.manifest.invalid_field", field: "version" },
      { code: "character.manifest.invalid_field", field: "displayName" },
      { code: "character.manifest.invalid_field", field: "distributionStatus" },
      { code: "character.manifest.invalid_field", field: "content.identity" },
      { code: "character.manifest.invalid_field", field: "content.soul" },
    ]);
  });

  it("reports malformed optional capability metadata without resolving an unsafe value", async () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-package-"));
    const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-runtime-"));
    fs.mkdirSync(path.join(packageRoot, "content"), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "content", "identity.md"), "# Identity\n");
    fs.writeFileSync(path.join(packageRoot, "content", "soul.md"), "# Soul\n");
    fs.writeFileSync(path.join(packageRoot, "avatar.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
    const manifest = {
      ...TEST_PACKAGE_METADATA,
      schemaVersion: 1,
      id: "fixture.malformed-voice",
      version: "1.0.0",
      displayName: "错误音色声明测试角色",
      distributionStatus: "redistributable",
      content: { identity: "content/identity.md", soul: "content/soul.md", avatar: "avatar.svg" },
      capabilities: { voice: { profile: false } },
    } as unknown as CharacterPackageManifest;
    const runtime = createCharacterRuntime({
      userDataRoot,
      activeCharacterId: manifest.id,
      packages: [{ source: "builtin", rootPath: packageRoot, manifest }],
    });

    const snapshot = await runtime.initialize();

    expect(snapshot).toMatchObject({
      status: "failed",
      activeCharacter: null,
      diagnostics: [{
        code: "character.manifest.invalid_field",
        characterId: "fixture.malformed-voice",
        field: "capabilities.voice.profile",
      }],
    });
  });

  it("initializes the repository license-safe fixture through the same public seam", async () => {
    const fixtureRoot = path.join(process.cwd(), "test-fixtures", "characters", "lumen");
    const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-runtime-"));
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixtureRoot, "character.json"), "utf8"),
    ) as CharacterPackageManifest;
    const runtime = createCharacterRuntime({
      userDataRoot,
      activeCharacterId: manifest.id,
      packages: [{ source: "local", rootPath: fixtureRoot, manifest }],
    });

    const snapshot = await runtime.initialize();

    expect(snapshot).toMatchObject({
      status: "ready",
      diagnostics: [],
      activeCharacter: {
        id: "fixture.lumen",
        displayName: "流明",
        source: "local",
        readOnly: false,
        distributionStatus: "redistributable",
        packageRoot: fixtureRoot,
        content: {
          identityPath: path.join(fixtureRoot, "content", "identity.md"),
          soulPath: path.join(fixtureRoot, "content", "soul.md"),
          avatarPath: path.join(fixtureRoot, "avatar.svg"),
        },
        stateRoot: path.join(userDataRoot, "characters", "fixture.lumen"),
      },
    });
  });

  it("requires application compatibility and asset provenance in a Character Package manifest", async () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-package-"));
    const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-runtime-"));
    fs.mkdirSync(path.join(packageRoot, "content"), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "content", "identity.md"), "# Identity\n");
    fs.writeFileSync(path.join(packageRoot, "content", "soul.md"), "# Soul\n");
    fs.writeFileSync(path.join(packageRoot, "avatar.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
    const manifest = {
      schemaVersion: 1,
      id: "fixture.missing-provenance",
      version: "1.0.0",
      displayName: "缺少来源声明的测试角色",
      distributionStatus: "redistributable",
      content: { identity: "content/identity.md", soul: "content/soul.md", avatar: "avatar.svg" },
    } as unknown as CharacterPackageManifest;
    const runtime = createCharacterRuntime({
      userDataRoot,
      activeCharacterId: manifest.id,
      packages: [{ source: "builtin", rootPath: packageRoot, manifest }],
    });

    const snapshot = await runtime.initialize();

    expect(snapshot.status).toBe("failed");
    expect(snapshot.diagnostics.map(({ code, field }) => ({ code, field }))).toEqual([
      { code: "character.manifest.invalid_field", field: "compatibility.minimumAppVersion" },
      { code: "character.manifest.invalid_field", field: "assetProvenance" },
    ]);
  });
});
