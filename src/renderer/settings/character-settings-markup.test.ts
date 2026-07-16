import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const html = fs.readFileSync(fileURLToPath(new URL("./index.html", import.meta.url)), "utf8");

describe("character settings markup", () => {
  it("adds a dedicated character navigation entry and import surface", () => {
    expect(html).toContain('data-section="characters"');
    expect(html).toContain('id="characters-panel"');
    expect(html).toContain('id="character-import-btn"');
    expect(html).toContain('id="character-package-list"');
  });

  it("states that switching remains unavailable instead of exposing a partial control", () => {
    const panel = html.match(/<section[^>]+id="characters-panel"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(panel).toContain("角色切换将在对话、语音、Live2D 与独立状态全部接入后开放");
    expect(panel).not.toContain("切换角色</button>");
  });
});
