export type CharacterCapabilityKey =
  | "worldbook"
  | "live2d"
  | "semanticActions"
  | "voice"
  | "stickers"
  | "openers";

export interface CharacterSettingsSnapshot {
  status: "ready" | "failed";
  activeCharacter: { id: string; displayName: string } | null;
  packages: Array<{
    id: string;
    displayName: string;
    version: string;
    source: "builtin" | "local";
    readOnly: boolean;
    distributionStatus: "redistributable" | "local-only";
    capabilities: Record<CharacterCapabilityKey, "available" | "unavailable">;
    health: {
      status: "healthy" | "unhealthy";
      diagnostics: Array<{ code: string; message: string }>;
    };
  }>;
}

const CAPABILITY_LABELS: Record<CharacterCapabilityKey, string> = {
  worldbook: "世界书",
  live2d: "Live2D",
  semanticActions: "语义动作",
  voice: "音色",
  stickers: "表情包",
  openers: "主动开口",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

export function renderCharacterPackages(snapshot: CharacterSettingsSnapshot): string {
  if (snapshot.packages.length === 0) {
    return '<div class="character-empty">还没有可用角色。</div>';
  }

  return snapshot.packages.map((characterPackage) => {
    const isActive = characterPackage.id === snapshot.activeCharacter?.id;
    const isHealthy = characterPackage.health.status === "healthy";
    const capabilities = (Object.entries(characterPackage.capabilities) as Array<[
      CharacterCapabilityKey,
      "available" | "unavailable",
    ]>)
      .filter(([, status]) => status === "available")
      .map(([capability]) => `<span class="character-capability">${CAPABILITY_LABELS[capability]}</span>`)
      .join("");
    const diagnostic = characterPackage.health.diagnostics[0]?.message;

    return `
      <article class="character-package-row">
        <div class="character-package-row__main">
          <div class="character-package-row__title">
            <strong>${escapeHtml(characterPackage.displayName)}</strong>
            <span class="character-package-row__meta">${escapeHtml(characterPackage.id)} · v${escapeHtml(characterPackage.version)}</span>
          </div>
          <div class="character-package-row__capabilities">
            ${capabilities || '<span class="character-capability">基础角色内容</span>'}
          </div>
          ${diagnostic ? `<p class="character-package-row__diagnostic">${escapeHtml(diagnostic)}</p>` : ""}
        </div>
        <div class="character-package-row__badges">
          ${isActive ? '<span class="character-badge character-badge--active">当前使用</span>' : ""}
          <span class="character-badge">${characterPackage.source === "builtin" ? "内置只读" : "本地安装"}</span>
          ${characterPackage.distributionStatus === "local-only" ? '<span class="character-badge character-badge--warning">仅限本机</span>' : ""}
          <span class="character-badge ${isHealthy ? "character-badge--healthy" : "character-badge--unhealthy"}">${isHealthy ? "状态正常" : "需要修复"}</span>
        </div>
      </article>
    `;
  }).join("");
}
