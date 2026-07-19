import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  createCharacterFidelityHarness,
  freezeFidelityBaseline,
  loadFidelityBaseline,
  validateFidelityPromptPack,
  type FidelityPromptPack,
  type FidelityScore,
} from "./character-fidelity";

function writeCharacterPackage(root: string, input: Readonly<{
  version?: string;
  identity?: string;
  displayName?: string;
}> = {}): string {
  const packageRoot = path.join(root, "local.hoshino");
  fs.mkdirSync(path.join(packageRoot, "content", "styles"), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, "worldbook"), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, "character.json"), JSON.stringify({
    schemaVersion: 1,
    id: "local.hoshino",
    version: input.version ?? "1.0.1",
    displayName: input.displayName ?? "星野",
    distributionStatus: "local-only",
    content: {
      identity: "content/identity.md",
      soul: "content/soul.md",
      avatar: "avatar.png",
      examples: "content/examples.md",
      toneRules: "content/tone-rules.md",
      stylesDirectory: "content/styles",
    },
    response: { language: "ja", translation: { targetLanguage: "zh-CN" } },
    capabilities: { worldbook: { directory: "worldbook" } },
  }, null, 2));
  fs.writeFileSync(path.join(packageRoot, "content", "identity.md"), input.identity ?? "星野の工程版 identity\n");
  fs.writeFileSync(path.join(packageRoot, "content", "soul.md"), "星野の工程版 soul\n");
  fs.writeFileSync(path.join(packageRoot, "content", "examples.md"), "先生、おはよう。\n");
  fs.writeFileSync(path.join(packageRoot, "content", "tone-rules.md"), "日文で返答する。\n");
  fs.writeFileSync(path.join(packageRoot, "content", "styles", "01_default.md"), "ゆっくり話す。\n");
  fs.writeFileSync(path.join(packageRoot, "worldbook", "abydos.md"), "アビドスは大切な場所。\n");
  fs.writeFileSync(path.join(packageRoot, "avatar.png"), "not character content");
  return packageRoot;
}

describe("Character Fidelity Harness", () => {
  it("freezes local Character Content as a read-only, traceable Fidelity Baseline", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "character-fidelity-baseline-"));
    const packageRoot = writeCharacterPackage(root);
    const baselineDirectory = path.join(root, "fidelity", "baselines", "hoshino-engineering-v1");

    const frozen = freezeFidelityBaseline({
      sourcePackageRoot: packageRoot,
      baselineDirectory,
      frozenAt: "2026-07-19T00:00:00.000Z",
    });

    expect(frozen).toMatchObject({
      status: "frozen",
      baseline: {
        schemaVersion: 1,
        characterId: "local.hoshino",
        characterVersion: "1.0.1",
        responseLanguage: "ja",
        frozenAt: "2026-07-19T00:00:00.000Z",
      },
    });
    expect(frozen.baseline.files.map((file) => file.path)).toEqual([
      "content/examples.md",
      "content/identity.md",
      "content/soul.md",
      "content/styles/01_default.md",
      "content/tone-rules.md",
      "worldbook/abydos.md",
    ]);
    expect(frozen.baseline.files.every((file) => file.sha256.startsWith("sha256:"))).toBe(true);
    expect(fs.existsSync(frozen.path)).toBe(true);
    expect(fs.statSync(frozen.path).mode & 0o222).toBe(0);

    expect(loadFidelityBaseline(frozen.path)).toEqual(frozen.baseline);
  });

  it("never overwrites a frozen baseline when the source package later changes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "character-fidelity-immutable-"));
    const packageRoot = writeCharacterPackage(root);
    const baselineDirectory = path.join(root, "fidelity", "baselines", "hoshino-engineering-v1");
    const first = freezeFidelityBaseline({ sourcePackageRoot: packageRoot, baselineDirectory });

    fs.writeFileSync(path.join(packageRoot, "content", "identity.md"), "后续候补 identity\n");

    expect(() => freezeFidelityBaseline({ sourcePackageRoot: packageRoot, baselineDirectory }))
      .toThrow("已冻结，拒绝覆盖不同的 Character Content");
    expect(loadFidelityBaseline(first.path)).toEqual(first.baseline);
  });

  it("creates anonymous randomized A/B review pairs without installing a second character", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "character-fidelity-session-"));
    const baselinePackage = writeCharacterPackage(path.join(root, "baseline"));
    const candidatePackage = writeCharacterPackage(path.join(root, "candidate"), {
      version: "1.1.0",
      identity: "星野の候補版 identity\n",
    });
    const baseline = freezeFidelityBaseline({
      sourcePackageRoot: baselinePackage,
      baselineDirectory: path.join(root, "baselines", "hoshino-engineering-v1"),
      frozenAt: "2026-07-19T00:00:00.000Z",
    }).baseline;
    const prompts: FidelityPromptPack = {
      schemaVersion: 1,
      id: "hoshino-fidelity-v1",
      version: "1.0.0",
      characterId: "local.hoshino",
      prompts: [
        { id: "daily-rest", category: "daily", mode: "chat", text: "今日は少し疲れた。", repeatCount: 3 },
        { id: "phone-checkin", category: "phone", mode: "phone", text: "今、少しだけ話せる？" },
      ],
    };
    const generate = vi.fn(async (request: { variant: "baseline" | "candidate" }) => ({
      text: request.variant === "baseline"
        ? "うへ～、先生。少し休もうか。"
        : "先生、無理しすぎないで。少しだけ一緒に休もう。",
    }));
    const harness = createCharacterFidelityHarness({ generate, now: () => "2026-07-19T00:00:00.000Z" });

    const session = await harness.run({
      sessionDirectory: path.join(root, "sessions", "blind-001"),
      sessionId: "blind-001",
      baseline,
      candidatePackageRoot: candidatePackage,
      promptPack: prompts,
      model: { provider: "local", baseUrl: "http://127.0.0.1:8080/v1", model: "qwen3.5-9b" },
      randomSeed: 20260719,
    });

    expect(session).toMatchObject({
      sessionId: "blind-001",
      pairCount: 4,
      reviewPath: path.join(root, "sessions", "blind-001", "review.json"),
    });
    expect(generate).toHaveBeenCalledTimes(8);
    const review = JSON.parse(fs.readFileSync(session.reviewPath, "utf8")) as Record<string, unknown>;
    const privateMetadata = JSON.parse(fs.readFileSync(session.privateMetadataPath, "utf8")) as Record<string, unknown>;
    expect(JSON.stringify(review)).not.toContain("baseline");
    expect(JSON.stringify(review)).not.toContain("candidate");
    expect(review).toMatchObject({
      promptPack: { id: "hoshino-fidelity-v1", version: "1.0.0" },
      pairs: expect.arrayContaining([
        expect.objectContaining({ labels: expect.objectContaining({ A: expect.any(String), B: expect.any(String) }) }),
      ]),
    });
    expect(privateMetadata).toMatchObject({
      randomSeed: 20260719,
      promptPack: { id: "hoshino-fidelity-v1", version: "1.0.0" },
      model: { provider: "local", model: "qwen3.5-9b" },
    });
    expect(JSON.stringify(privateMetadata)).toContain("baseline");
    expect(JSON.stringify(privateMetadata)).toContain("candidate");
  });

  it("rejects a version-only candidate so the baseline cannot be relabeled as a replacement", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "character-fidelity-same-content-"));
    const baselinePackage = writeCharacterPackage(path.join(root, "baseline"));
    const candidatePackage = writeCharacterPackage(path.join(root, "candidate"), { version: "1.1.0" });
    const baseline = freezeFidelityBaseline({
      sourcePackageRoot: baselinePackage,
      baselineDirectory: path.join(root, "baselines", "hoshino-engineering-v1"),
    }).baseline;
    const harness = createCharacterFidelityHarness({ generate: async () => ({ text: "先生、おはよう。" }) });

    await expect(harness.run({
      sessionDirectory: path.join(root, "sessions", "same-content"),
      sessionId: "same-content",
      baseline,
      candidatePackageRoot: candidatePackage,
      promptPack: {
        schemaVersion: 1,
        id: "hoshino-fidelity-v1",
        version: "1.0.0",
        characterId: "local.hoshino",
        prompts: [{ id: "daily", category: "daily", mode: "chat", text: "おはよう。" }],
      },
      model: { provider: "local", baseUrl: "http://127.0.0.1:8080/v1", model: "qwen3.5-9b" },
      randomSeed: 1,
    })).rejects.toThrow("Candidate 必须与 Baseline 使用不同的 Character Content");
  });

  it("rejects a display-name-only candidate so a metadata relabel is not treated as new character content", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "character-fidelity-display-name-"));
    const baselinePackage = writeCharacterPackage(path.join(root, "baseline"));
    const candidatePackage = writeCharacterPackage(path.join(root, "candidate"), {
      displayName: "星野候補",
    });
    const baseline = freezeFidelityBaseline({
      sourcePackageRoot: baselinePackage,
      baselineDirectory: path.join(root, "baselines", "hoshino-engineering-v1"),
    }).baseline;
    const harness = createCharacterFidelityHarness({ generate: async () => ({ text: "先生、おはよう。" }) });

    await expect(harness.run({
      sessionDirectory: path.join(root, "sessions", "same-content-display-name"),
      sessionId: "same-content-display-name",
      baseline,
      candidatePackageRoot: candidatePackage,
      promptPack: {
        schemaVersion: 1,
        id: "hoshino-fidelity-v1",
        version: "1.0.0",
        characterId: "local.hoshino",
        prompts: [{ id: "daily", category: "daily", mode: "chat", text: "おはよう。" }],
      },
      model: { provider: "local", baseUrl: "http://127.0.0.1:8080/v1", model: "qwen3.5-9b" },
      randomSeed: 1,
    })).rejects.toThrow("Candidate 必须与 Baseline 使用不同的 Character Content");
  });

  it("records explainable hard failures before subjective blind scoring", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "character-fidelity-hard-checks-"));
    const baseline = freezeFidelityBaseline({
      sourcePackageRoot: writeCharacterPackage(path.join(root, "baseline")),
      baselineDirectory: path.join(root, "baselines", "hoshino-engineering-v1"),
    }).baseline;
    const candidatePackage = writeCharacterPackage(path.join(root, "candidate"), {
      version: "1.1.0",
      identity: "星野の候補版 score identity\n",
    });
    const harness = createCharacterFidelityHarness({
      generate: async ({ variant }) => ({
        text: variant === "baseline"
          ? "昔涟は花の種をくれる。水着で、前にも二人で約束した。うへ～、うへ～。ユメ先輩。/tmp/rewritten.txt"
          : "这是中文译文，没有日文。",
      }),
    });

    const session = await harness.run({
      sessionDirectory: path.join(root, "sessions", "hard-checks"),
      sessionId: "hard-checks",
      baseline,
      candidatePackageRoot: candidatePackage,
      promptPack: {
        schemaVersion: 1,
        id: "hoshino-fidelity-v1",
        version: "1.0.0",
        characterId: "local.hoshino",
        prompts: [{
          id: "assistant-exact-output",
          category: "assistant",
          mode: "chat",
          text: "请确认文件路径。",
          protectedText: ["/tmp/original.txt"],
          forbiddenPlotTerms: ["ユメ先輩"],
        }],
      },
      model: { provider: "local", baseUrl: "http://127.0.0.1:8080/v1", model: "qwen3.5-9b" },
      randomSeed: 7,
    });

    const review = JSON.parse(fs.readFileSync(session.reviewPath, "utf8")) as {
      pairs: Array<{ answers: Record<string, { hardFailures: Array<{ code: string }> }> }>;
    };
    const codes = review.pairs.flatMap((pair) => Object.values(pair.answers))
      .flatMap((answer) => answer.hardFailures.map((failure) => failure.code));
    expect(codes).toEqual(expect.arrayContaining([
      "identity-leakage",
      "cyrene-imagery",
      "form-leakage",
      "fabricated-history",
      "language-error",
      "tool-result-damaged",
      "translation-mixed",
      "catchphrase-repetition",
      "irrelevant-plot-exposition",
    ]));
  });

  it("keeps user scores separate from hidden mappings and reports repeat-template dependence", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "character-fidelity-scores-"));
    const baseline = freezeFidelityBaseline({
      sourcePackageRoot: writeCharacterPackage(path.join(root, "baseline")),
      baselineDirectory: path.join(root, "baselines", "hoshino-engineering-v1"),
    }).baseline;
    const candidatePackage = writeCharacterPackage(path.join(root, "candidate"), {
      version: "1.1.0",
      identity: "星野の候補版 score identity\n",
    });
    const harness = createCharacterFidelityHarness({
      generate: async ({ variant }) => ({
        text: variant === "baseline" ? "先生、少し休もうか。" : "先生、無理はしないで。そばにいるよ。",
      }),
    });
    const session = await harness.run({
      sessionDirectory: path.join(root, "sessions", "scores"),
      sessionId: "scores",
      baseline,
      candidatePackageRoot: candidatePackage,
      promptPack: {
        schemaVersion: 1,
        id: "hoshino-fidelity-v1",
        version: "1.0.0",
        characterId: "local.hoshino",
        prompts: [{ id: "daily-repeat", category: "daily", mode: "chat", text: "今日は疲れた。", repeatCount: 3 }],
      },
      model: { provider: "local", baseUrl: "http://127.0.0.1:8080/v1", model: "qwen3.5-9b" },
      randomSeed: 3,
    });
    const privateMetadata = JSON.parse(fs.readFileSync(session.privateMetadataPath, "utf8")) as {
      pairs: Array<{ pairId: string; mapping: { A: "baseline" | "candidate"; B: "baseline" | "candidate" } }>;
    };
    const scores: FidelityScore[] = privateMetadata.pairs.map((pair) => {
      const candidateLabel = pair.mapping.A === "candidate" ? "A" : "B";
      const baselineLabel = candidateLabel === "A" ? "B" : "A";
      return {
        pairId: pair.pairId,
        preference: candidateLabel,
        ratings: {
          A: candidateLabel === "A"
            ? { fidelity: 5, japaneseNaturalness: 5, acceptable: true }
            : { fidelity: 3, japaneseNaturalness: 3, acceptable: true },
          B: baselineLabel === "B"
            ? { fidelity: 3, japaneseNaturalness: 3, acceptable: true }
            : { fidelity: 5, japaneseNaturalness: 5, acceptable: true },
        },
      };
    });
    scores[0] = { ...scores[0], note: "第一印象更自然" };

    await harness.recordScores({ sessionDirectory: path.dirname(session.reviewPath), scores });
    const scoreFile = fs.readFileSync(session.scorePath, "utf8");
    expect(scoreFile).not.toContain("baseline");
    expect(scoreFile).not.toContain("candidate");
    expect((JSON.parse(scoreFile) as { scores: unknown[] }).scores).toEqual(expect.arrayContaining([
      expect.objectContaining({ pairId: scores[0].pairId, note: "第一印象更自然" }),
    ]));

    const report = harness.report({ sessionDirectory: path.dirname(session.reviewPath) });
    expect(report).toMatchObject({
      hardFailureCount: 0,
      candidatePreferenceRate: 1,
      candidateMedianFidelity: 5,
      candidateMedianJapaneseNaturalness: 5,
      status: "criteria-met-awaiting-user-decision",
    });
    expect(report.templateDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ promptId: "daily-repeat", total: 3, uniqueResponseCount: 1 }),
    ]));
  });

  it("ships a fixed, category-complete Hoshino blind-test prompt pack", () => {
    const promptPack = JSON.parse(fs.readFileSync(
      path.join(process.cwd(), "test-fixtures", "fidelity", "hoshino-prompts.v1.json"),
      "utf8",
    )) as FidelityPromptPack;

    expect(() => validateFidelityPromptPack(promptPack, "local.hoshino")).not.toThrow();
    expect(promptPack.prompts).toHaveLength(30);
    expect(new Set(promptPack.prompts.map((prompt) => prompt.category))).toEqual(new Set([
      "daily", "comfort", "serious", "relationship", "canon", "assistant", "phone",
    ]));
    expect(promptPack.prompts.filter((prompt) => prompt.repeatCount === 3).map((prompt) => prompt.id))
      .toHaveLength(5);
  });
});
