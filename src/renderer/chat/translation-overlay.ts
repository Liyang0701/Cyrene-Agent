import type {
  CharacterTranslationDisplayResult,
  CharacterTranslationFailureCode,
} from "../../shared/character-response";

export type TranslationOverlay =
  | Readonly<{ status: "loading" }>
  | CharacterTranslationDisplayResult;

const FAILURE_CODES = new Set<CharacterTranslationFailureCode>([
  "cancelled",
  "timeout",
  "provider-error",
  "invalid-output",
]);

export type TranslationOverlayView = Readonly<{
  tone: "pending" | "ready" | "failed";
  label: string;
  text: string;
}>;

export function parseTranslationOverlayEvent(
  name: string | undefined,
  value: unknown,
): TranslationOverlay | null {
  if (name === "character.translation.started") {
    return value && typeof value === "object" && (value as { enabled?: unknown }).enabled === true
      ? { status: "loading" }
      : null;
  }
  if (!value || typeof value !== "object") return null;
  const translation = (value as { translation?: unknown }).translation;
  if (!translation || typeof translation !== "object") return null;
  const record = translation as Record<string, unknown>;
  if (
    name === "character.translation.ready"
    && record.status === "ready"
    && record.targetLanguage === "zh-CN"
    && typeof record.text === "string"
    && record.text.trim().length > 0
  ) {
    return { status: "ready", text: record.text, targetLanguage: "zh-CN" };
  }
  if (
    name === "character.translation.failed"
    && record.status === "failed"
    && record.targetLanguage === "zh-CN"
    && typeof record.code === "string"
    && FAILURE_CODES.has(record.code as CharacterTranslationFailureCode)
    && typeof record.message === "string"
  ) {
    return {
      status: "failed",
      targetLanguage: "zh-CN",
      code: record.code as CharacterTranslationFailureCode,
      message: record.message,
    };
  }
  return null;
}

export function translationOverlayView(
  overlay: TranslationOverlay | null | undefined,
): TranslationOverlayView | null {
  if (!overlay) return null;
  if (overlay.status === "loading") {
    return { tone: "pending", label: "正在生成中文译文…", text: "" };
  }
  if (overlay.status === "ready") {
    return { tone: "ready", label: "中文译文", text: overlay.text };
  }
  return { tone: "failed", label: "中文译文暂不可用", text: overlay.message };
}
