export type CharacterTranslationTargetLanguage = "zh-CN";

export type CharacterTranslationFailureCode =
  | "cancelled"
  | "timeout"
  | "provider-error"
  | "invalid-output";

export type CharacterTranslationDisplayResult =
  | Readonly<{
    status: "ready";
    text: string;
    targetLanguage: CharacterTranslationTargetLanguage;
  }>
  | Readonly<{
    status: "failed";
    targetLanguage: CharacterTranslationTargetLanguage;
    code: CharacterTranslationFailureCode;
    message: string;
  }>;
