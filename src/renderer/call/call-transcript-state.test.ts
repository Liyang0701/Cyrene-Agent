import { describe, expect, it } from "vitest";
import {
  applyCallResponseUpdate,
  beginCallUserTranscript,
  createCallTranscriptState,
} from "./call-transcript-state";

describe("call transcript state", () => {
  it("shows the original first and attaches its translation only to the same response", () => {
    let state = createCallTranscriptState();
    state = beginCallUserTranscript("晚安");
    state = applyCallResponseUpdate(state, {
      responseId: "1:1",
      phase: "original",
      original: "おやすみなさい、先生。",
    });
    state = applyCallResponseUpdate(state, {
      responseId: "1:1",
      phase: "translation",
      original: "おやすみなさい、先生。",
      translation: { status: "ready", text: "晚安，老师。", targetLanguage: "zh-CN" },
    });

    expect(state).toEqual({
      userText: "晚安",
      responseId: "1:1",
      originalText: "おやすみなさい、先生。",
      translation: { status: "ready", text: "晚安，老师。", targetLanguage: "zh-CN" },
    });
  });

  it("does not let a delayed translation overwrite a newer user transcript", () => {
    let state = createCallTranscriptState();
    state = applyCallResponseUpdate(state, {
      responseId: "1:1",
      phase: "original",
      original: "おやすみなさい、先生。",
    });
    state = beginCallUserTranscript("明天见");
    state = applyCallResponseUpdate(state, {
      responseId: "1:1",
      phase: "translation",
      original: "おやすみなさい、先生。",
      translation: { status: "ready", text: "晚安，老师。", targetLanguage: "zh-CN" },
    });

    expect(state).toEqual({
      userText: "明天见",
      responseId: null,
      originalText: "",
      translation: undefined,
    });
  });
});
