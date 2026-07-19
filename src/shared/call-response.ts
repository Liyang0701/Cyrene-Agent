import type { CharacterTranslationDisplayResult } from "./character-response";

/**
 * 通话主进程与渲染进程之间的角色回复协议。
 * 原文与 Translation Overlay 分两阶段投递，避免译文阻塞 TTS 或被当成第二句角色发言。
 */
export type CallResponsePayload =
  | Readonly<{
    responseId: string;
    phase: "original";
    original: string;
  }>
  | Readonly<{
    responseId: string;
    phase: "translation";
    original: string;
    translation: CharacterTranslationDisplayResult;
  }>;
