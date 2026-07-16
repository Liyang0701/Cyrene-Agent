import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Character State Root store integration", () => {
  let userDataRoot: string;

  beforeEach(() => {
    vi.resetModules();
    userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "character-state-stores-"));
    vi.doMock("electron", () => ({
      app: {
        getPath: () => userDataRoot,
        getAppPath: () => process.cwd(),
      },
      shell: { openPath: vi.fn() },
    }));
  });

  it("routes chat, memory, relationship, entity and proactive stores into the active layout", async () => {
    const stateModule = await import("./character-state");
    const migration = await stateModule.migrateLegacyCyreneState({ userDataRoot, characterId: "cyrene" });
    expect(migration.status).toBe("migrated");
    const layout = stateModule.resolveCharacterStateLayout(userDataRoot, "cyrene");
    stateModule.configureActiveCharacterState(layout);

    const chats = await import("../chats/chats-store");
    chats.initialize();
    chats.createSession({ title: "隔离会话" });
    expect(chats.getRootDir()).toBe(layout.chatsRoot);
    expect(fs.existsSync(path.join(layout.chatsRoot, "index.json"))).toBe(true);
    expect(fs.existsSync(path.join(userDataRoot, "cyrene-chats"))).toBe(false);

    const { memoryStore } = await import("../memory/memory-store");
    await memoryStore.load();
    expect(fs.existsSync(layout.memoryFile)).toBe(true);
    expect(fs.existsSync(path.join(userDataRoot, "memory.json"))).toBe(false);

    const relationship = await import("../relationship/relationship-log");
    await relationship.recordRelationshipTurn({
      userText: "今天很开心",
      assistantText: "那就好",
      cyreneFeeling: "happy",
      channel: "desktop",
    });
    expect(fs.existsSync(layout.relationshipFile)).toBe(true);

    const { entityGraph } = await import("../memory/entity-graph");
    entityGraph.ingest("我的朋友小鹿是很重要的人");
    expect(fs.existsSync(layout.entityGraphFile)).toBe(true);

    const opener = await import("../opener/desire-engine");
    const openerState = opener.defaultState();
    openerState.globalDesire = 12;
    opener.saveState(openerState);
    expect(fs.readFileSync(layout.proactiveStateFile, "utf8")).toContain('"globalDesire": 12');
  });

  it("keeps model runtimes outside the per-character state layout", async () => {
    const { resolveCharacterStateLayout } = await import("./character-state");
    const layout = resolveCharacterStateLayout(userDataRoot, "cyrene");
    const values = Object.values(layout);

    expect(values.every((value) => value.startsWith(layout.root))).toBe(true);
    expect(values.some((value) => /models?|embedding|reranker|asr/i.test(path.relative(layout.root, value)))).toBe(false);
  });
});
