import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { describe, expect, it } from "vitest";

const SCRIPT = path.resolve("scripts/prepare-local-hoshino-response-package.mjs");

function createPackage(root: string, id = "local.hoshino"): string {
  const source = path.join(root, "source");
  fs.mkdirSync(path.join(source, "content"), { recursive: true });
  fs.writeFileSync(path.join(source, "content", "identity.md"), "local-only content\n");
  fs.writeFileSync(path.join(source, "character.json"), JSON.stringify({
    schemaVersion: 1,
    id,
    version: "1.0.0",
    displayName: "星野",
    content: { identity: "content/identity.md" },
  }));
  return source;
}

describe("local Hoshino response package preparation", () => {
  it("reproducibly upgrades a user-owned package without changing the source", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hoshino-response-package-"));
    const source = createPackage(root);
    const output = path.join(root, "local.hoshino-1.0.1");

    const result = spawnSync(process.execPath, [SCRIPT, source, output], { encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      id: "local.hoshino",
      version: "1.0.1",
      response: { language: "ja", translation: { targetLanguage: "zh-CN" } },
    });
    expect(JSON.parse(fs.readFileSync(path.join(output, "character.json"), "utf8"))).toMatchObject({
      version: "1.0.1",
      response: { language: "ja", translation: { targetLanguage: "zh-CN" } },
    });
    expect(JSON.parse(fs.readFileSync(path.join(source, "character.json"), "utf8"))).not.toHaveProperty("response");
    expect(fs.readFileSync(path.join(output, "content", "identity.md"), "utf8")).toBe("local-only content\n");
  });

  it("refuses to rewrite a different character as Hoshino", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hoshino-response-package-wrong-id-"));
    const source = createPackage(root, "fixture.lumen");
    const result = spawnSync(process.execPath, [SCRIPT, source, path.join(root, "output")], { encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("只允许处理 local.hoshino");
  });
});
