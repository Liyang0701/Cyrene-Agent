import type { CallResponsePayload } from "../../shared/call-response";
import type { CharacterTranslationDisplayResult } from "../../shared/character-response";

export type CallTranscriptState = Readonly<{
  userText: string;
  responseId: string | null;
  originalText: string;
  translation: CharacterTranslationDisplayResult | undefined;
}>;

export function createCallTranscriptState(): CallTranscriptState {
  return Object.freeze({
    userText: "",
    responseId: null,
    originalText: "",
    translation: undefined,
  });
}

/** 新一轮 ASR 一旦开始，上一轮的异步展示附注不应再污染当前转写。 */
export function beginCallUserTranscript(
  userText: string,
): CallTranscriptState {
  return Object.freeze({
    userText,
    responseId: null,
    originalText: "",
    translation: undefined,
  });
}

export function applyCallResponseUpdate(
  state: CallTranscriptState,
  update: CallResponsePayload,
): CallTranscriptState {
  if (update.phase === "original") {
    return Object.freeze({
      ...state,
      responseId: update.responseId,
      originalText: update.original,
      translation: undefined,
    });
  }
  if (update.responseId !== state.responseId) return state;
  return Object.freeze({ ...state, translation: update.translation });
}
