import { describe, expect, it } from "vitest";
import { renderCharacterPackages } from "./character-settings-view";

describe("character settings view", () => {
  it("renders active, health, distribution and capability state without trusting package HTML", () => {
    const html = renderCharacterPackages({
      status: "ready",
      activeCharacter: { id: "fixture.lumen", displayName: "流明" },
      packages: [{
        id: "fixture.lumen",
        displayName: '<img src=x onerror="alert(1)">',
        version: "1.0.0",
        source: "local",
        readOnly: false,
        distributionStatus: "local-only",
        capabilities: {
          worldbook: "available",
          live2d: "unavailable",
          semanticActions: "unavailable",
          voice: "available",
          stickers: "unavailable",
          openers: "unavailable",
        },
        health: { status: "healthy", diagnostics: [] },
      }],
    });

    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img");
    expect(html).toContain("当前使用");
    expect(html).toContain("仅限本机");
    expect(html).toContain("世界书");
    expect(html).toContain("音色");
    expect(html).not.toContain("Live2D</span>");
  });

  it("shows structured diagnostics for an unhealthy package", () => {
    const html = renderCharacterPackages({
      status: "ready",
      activeCharacter: { id: "cyrene", displayName: "昔涟" },
      packages: [{
        id: "broken",
        displayName: "损坏角色",
        version: "1.0.0",
        source: "local",
        readOnly: false,
        distributionStatus: "redistributable",
        capabilities: {
          worldbook: "unavailable",
          live2d: "unavailable",
          semanticActions: "unavailable",
          voice: "unavailable",
          stickers: "unavailable",
          openers: "unavailable",
        },
        health: {
          status: "unhealthy",
          diagnostics: [{ code: "missing", message: "缺少 soul.md" }],
        },
      }],
    });

    expect(html).toContain("需要修复");
    expect(html).toContain("缺少 soul.md");
  });
});
