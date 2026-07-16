import { describe, expect, it } from "vitest";
import {
  buildCharacterSwitchConfirmation,
  renderCharacterPackages,
} from "./character-settings-view";

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
    expect(html).not.toContain('data-character-switch="fixture.lumen"');
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
    expect(html).not.toContain('data-character-switch="broken"');
  });

  it("renders a switch action and explains globally blocking activity", () => {
    const html = renderCharacterPackages({
      status: "ready",
      activeCharacter: { id: "cyrene", displayName: "昔涟" },
      switching: {
        blockingActivities: [{ kind: "voice-call", reason: "语音通话正在进行" }],
      },
      packages: [{
        id: "fixture.lumen",
        displayName: "流明",
        version: "1.0.0",
        source: "local",
        readOnly: false,
        distributionStatus: "redistributable",
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

    expect(html).toContain('data-character-switch="fixture.lumen"');
    expect(html).toContain("切换到流明");
    expect(html).toContain("disabled");
    expect(html).toContain("语音通话正在进行");
  });

  it("builds a confirmation that names the target, restart, and unavailable capabilities", () => {
    expect(buildCharacterSwitchConfirmation({
      id: "fixture.lumen",
      displayName: "流明",
      capabilities: {
        worldbook: "available",
        live2d: "unavailable",
        semanticActions: "unavailable",
        voice: "available",
        stickers: "unavailable",
        openers: "unavailable",
      },
    })).toEqual({
      title: "切换到「流明」？",
      message: "应用将保存当前状态并自动重启。该角色暂不提供：Live2D、语义动作、表情包、主动开口。",
      confirmLabel: "切换并重启",
    });
  });
});
