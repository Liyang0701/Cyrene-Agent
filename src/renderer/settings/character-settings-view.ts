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
  switching?: {
    blockingActivities: Array<{ kind: string; reason: string }>;
  };
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

export function buildCharacterSwitchConfirmation(characterPackage: {
  id: string;
  displayName: string;
  capabilities: Record<CharacterCapabilityKey, "available" | "unavailable">;
}): Readonly<{ title: string; message: string; confirmLabel: string }> {
  const unavailableCapabilities = (Object.entries(characterPackage.capabilities) as Array<[
    CharacterCapabilityKey,
    "available" | "unavailable",
  ]>)
    .filter(([, status]) => status === "unavailable")
    .map(([capability]) => CAPABILITY_LABELS[capability]);
  const unavailableMessage = unavailableCapabilities.length > 0
    ? `该角色暂不提供：${unavailableCapabilities.join("、")}。`
    : "该角色已提供全部可选能力。";

  return {
    title: `切换到「${characterPackage.displayName}」？`,
    message: `应用将保存当前状态并自动重启。${unavailableMessage}`,
    confirmLabel: "切换并重启",
  };
}

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
    const blockingReason = snapshot.switching?.blockingActivities.map(({ reason }) => reason).join("；") ?? "";
    const switchDisabled = Boolean(blockingReason);
    const switchAction = !isActive && isHealthy
      ? `<button type="button" class="character-switch-btn" data-character-switch="${escapeHtml(characterPackage.id)}"${switchDisabled ? " disabled" : ""} aria-label="切换到${escapeHtml(characterPackage.displayName)}">${switchDisabled ? "暂不可切换" : `切换到${escapeHtml(characterPackage.displayName)}`}</button>`
      : "";

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
          ${switchAction}
          ${switchDisabled && switchAction ? `<span class="character-switch-reason">${escapeHtml(blockingReason)}</span>` : ""}
        </div>
      </article>
    `;
  }).join("");
}
