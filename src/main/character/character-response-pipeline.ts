import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import type { CharacterResponseSettings } from "./character-runtime";
import type {
  CharacterTranslationDisplayResult,
  CharacterTranslationFailureCode,
} from "../../shared/character-response";

const TRANSLATION_POLICY_VERSION = 1 as const;
const DEFAULT_TRANSLATION_TIMEOUT_MS = 8_000;

class TranslationTimeoutError extends Error {
  constructor() {
    super("翻译超时");
    this.name = "TranslationTimeoutError";
  }
}

class InvalidTranslationOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTranslationOutputError";
  }
}

export type CharacterTranslationRequest = Readonly<{
  text: string;
  sourceLanguage: string;
  targetLanguage: "zh-CN";
  signal: AbortSignal;
}>;

export type CharacterTranslationProvider = (
  request: CharacterTranslationRequest,
) => Promise<string>;

type CharacterResponseTranslation =
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "disabled" }>
  | (Extract<CharacterTranslationDisplayResult, Readonly<{ status: "ready" }>> & Readonly<{
    cache: "hit" | "miss";
  }>)
  | Extract<CharacterTranslationDisplayResult, Readonly<{ status: "failed" }>>;

export type CharacterResponse = Readonly<{
  characterId: string;
  original: Readonly<{
    text: string;
    language: string;
  }>;
  translation: CharacterResponseTranslation;
}>;

export type CompleteCharacterResponseInput = Readonly<{
  characterId: string;
  originalText: string;
  language: string;
  translation: CharacterResponseSettings["translation"];
  cacheRoot?: string;
  signal?: AbortSignal;
}>;

export type CharacterResponsePipeline = Readonly<{
  complete(input: CompleteCharacterResponseInput): Promise<CharacterResponse>;
}>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function translationCacheFile(input: CompleteCharacterResponseInput): string | null {
  if (!input.cacheRoot || input.translation.status !== "available") return null;
  const digest = createHash("sha256").update(JSON.stringify({
    policyVersion: TRANSLATION_POLICY_VERSION,
    characterId: input.characterId,
    originalText: input.originalText,
    sourceLanguage: input.language,
    targetLanguage: input.translation.targetLanguage,
  })).digest("hex");
  return path.join(input.cacheRoot, `${digest}.json`);
}

function readCachedTranslation(filePath: string | null): string | null {
  if (!filePath) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    return parsed.schemaVersion === 1 && typeof parsed.text === "string" && parsed.text.trim()
      ? parsed.text
      : null;
  } catch {
    return null;
  }
}

function writeCachedTranslation(filePath: string | null, text: string): void {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 1, text }, null, 2)}\n`, { flag: "wx" });
    fs.renameSync(temporary, filePath);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

type ProtectedTranslationInput = Readonly<{
  text: string;
  tokens: readonly Readonly<{ placeholder: string; original: string }>[];
}>;

const PROTECTED_CONTENT_PATTERN = new RegExp([
  "```[\\s\\S]*?```",
  "`[^`\\n]+`",
  "^(?:\\s*)(?:\\$\\s*)?(?:npm|pnpm|yarn|npx|git|cd|node|python3?|pip3?|brew|docker|podman|curl|wget|make|cmake|go|cargo|uv|bun|deno|chmod|mkdir|cp|mv|rm|open|osascript|source|export)\\s+[^\\n]+$",
  "https?:\\/\\/[^\\s<>()]+",
  "(?:~|\\.{1,2})?\\/(?:[^\\s/]+\\/)*[^\\s,.;:!?，。；：！？]+",
  "[A-Za-z]:\\\\(?:[^\\s\\\\]+\\\\)*[^\\s,.;:!?，。；：！？]+",
  "(?:[A-Za-z_$][\\w$]*\\.)+[A-Za-z_$][\\w$]*(?:\\([^\\n)]*\\))?",
  "[A-Za-z_$][\\w$]*(?:[A-Z][a-z0-9_$]+)+",
  "\\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\\b",
  "\\b[A-Z][A-Z0-9_]{2,}\\b",
  "^\\s*[<{[][^\\n]*[>}\\]]\\s*,?\\s*$",
  "^\\s*(?:-\\s*)?[A-Za-z_$][\\w$.-]*:\\s+[^\\n]+$",
  "^\\s*<\\/?[A-Za-z][^>]*>[^\\n]*$",
].join("|"), "gm");

function protectTranslationInput(text: string): ProtectedTranslationInput {
  const tokens: Array<Readonly<{ placeholder: string; original: string }>> = [];
  const protectedText = text.replace(PROTECTED_CONTENT_PATTERN, (original) => {
    const placeholder = `__CYRENE_PROTECTED_${String(tokens.length).padStart(4, "0")}__`;
    tokens.push({ placeholder, original });
    return placeholder;
  });
  return { text: protectedText, tokens };
}

function restoreProtectedContent(
  translatedText: string,
  tokens: ProtectedTranslationInput["tokens"],
): string {
  const placeholders = translatedText.match(/__CYRENE_PROTECTED_\d{4}__/g) ?? [];
  const expected = new Set(tokens.map(({ placeholder }) => placeholder));
  if (
    placeholders.length !== tokens.length
    || placeholders.some((placeholder) => !expected.has(placeholder))
    || tokens.some(({ placeholder }) => translatedText.split(placeholder).length - 1 !== 1)
  ) {
    throw new InvalidTranslationOutputError("翻译结果破坏了受保护内容");
  }
  return tokens.reduce(
    (text, token) => text.split(token.placeholder).join(token.original),
    translatedText,
  );
}

export function createCharacterResponsePipeline(options: Readonly<{
  translate: CharacterTranslationProvider;
  timeoutMs?: number;
}>): CharacterResponsePipeline {
  return Object.freeze({
    async complete(input): Promise<CharacterResponse> {
      const original = { text: input.originalText, language: input.language };
      if (input.translation.status === "unavailable") {
        return deepFreeze({
          characterId: input.characterId,
          original,
          translation: { status: "unavailable" },
        });
      }
      if (!input.translation.enabled) {
        return deepFreeze({
          characterId: input.characterId,
          original,
          translation: { status: "disabled" },
        });
      }

      const cacheFile = translationCacheFile(input);
      const cachedText = readCachedTranslation(cacheFile);
      if (cachedText !== null) {
        return deepFreeze({
          characterId: input.characterId,
          original,
          translation: {
            status: "ready",
            text: cachedText,
            targetLanguage: input.translation.targetLanguage,
            cache: "hit",
          },
        });
      }

      const controller = new AbortController();
      const timeoutMs = options.timeoutMs ?? DEFAULT_TRANSLATION_TIMEOUT_MS;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const abortFromCaller = () => controller.abort(input.signal?.reason);
      if (input.signal?.aborted) abortFromCaller();
      else input.signal?.addEventListener("abort", abortFromCaller, { once: true });
      try {
        const protectedInput = protectTranslationInput(input.originalText);
        const providerPromise = options.translate({
          text: protectedInput.text,
          sourceLanguage: input.language,
          targetLanguage: input.translation.targetLanguage,
          signal: controller.signal,
        });
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timeoutHandle = setTimeout(() => {
            const timeoutError = new TranslationTimeoutError();
            controller.abort(timeoutError);
            reject(timeoutError);
          }, timeoutMs);
        });
        const translatedText = await Promise.race([providerPromise, timeoutPromise]);
        if (!translatedText.trim()) {
          throw new InvalidTranslationOutputError("翻译结果为空");
        }
        const restoredText = restoreProtectedContent(translatedText, protectedInput.tokens);
        writeCachedTranslation(cacheFile, restoredText);
        return deepFreeze({
          characterId: input.characterId,
          original,
          translation: {
            status: "ready",
            text: restoredText,
            targetLanguage: input.translation.targetLanguage,
            cache: "miss",
          },
        });
      } catch (error) {
        const timedOut = error instanceof TranslationTimeoutError
          || controller.signal.reason instanceof TranslationTimeoutError;
        const cancelled = controller.signal.aborted && !timedOut;
        const invalidOutput = error instanceof InvalidTranslationOutputError;
        const failureCode: CharacterTranslationFailureCode = timedOut
          ? "timeout"
          : cancelled
            ? "cancelled"
            : invalidOutput
              ? "invalid-output"
              : "provider-error";
        return deepFreeze({
          characterId: input.characterId,
          original,
          translation: {
            status: "failed",
            targetLanguage: input.translation.targetLanguage,
            code: failureCode,
            message: timedOut
              ? "翻译超时"
              : cancelled
              ? "翻译已取消"
              : error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
        input.signal?.removeEventListener("abort", abortFromCaller);
      }
    },
  });
}
