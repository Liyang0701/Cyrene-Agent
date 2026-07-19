import { splitTextBySentenceBreaks } from "../../shared/message-segmentation";
import {
  normalizeMobileMessageSegmentationMode,
  type MobileMessageSegmentationMode,
} from "../../shared/preferences";
import type { CharacterTranslationDisplayResult } from "../../shared/character-response";
import type { OutgoingPart } from "./types";

export type TextOutgoingPart = Extract<OutgoingPart, { kind: "text" }>;

export function buildTranslationAnnotationText(
  translation: CharacterTranslationDisplayResult | undefined,
): string | null {
  if (translation?.status !== "ready") return null;
  return `── 中文译文（仅供理解，非角色发言）──\n${translation.text}`;
}

export function buildTextOutgoingParts(
  replyText: string,
  mobileMessageSegmentation: MobileMessageSegmentationMode,
): TextOutgoingPart[] {
  const mode = normalizeMobileMessageSegmentationMode(mobileMessageSegmentation);
  const texts = mode === "on" ? splitTextBySentenceBreaks(replyText) : [replyText];
  return texts.map((text) => ({ kind: "text", text }));
}
