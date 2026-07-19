import fs from "fs";
import path from "path";
import {
  createCharacterFidelityHarness,
  freezeFidelityBaseline,
  type FidelityGenerator,
  type FidelityModelConfiguration,
  type FidelityPromptPack,
  type FidelityScore,
} from "./character-fidelity";
import { createLocalFidelityGenerator } from "./local-fidelity-generator";

type CliDependencies = Readonly<{
  write?: (line: string) => void;
  generate?: FidelityGenerator;
}>;

export type CharacterFidelityCliDependencies = Readonly<{
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  createGenerator?: () => FidelityGenerator;
}>;

type ParsedArguments = Readonly<{
  positional: readonly string[];
  flags: Readonly<Record<string, string>>;
}>;

const USAGE = [
  "Usage:",
  "  npm run fidelity -- freeze --source <source-character-package> --out <baseline-directory> [--frozen-at <ISO-8601>]",
  "  npm run fidelity -- run --baseline <baseline.json> --candidate <candidate-package> --prompts <prompt-pack.json> --out <session-directory> --base-url http://127.0.0.1:8080/v1 --model <model> --seed <integer> [--session-id <id>] [--temperature <number>] [--max-tokens <integer>]",
  "  npm run fidelity -- score --session <session-directory> --scores <scores.json>",
  "  npm run fidelity -- report --session <session-directory>",
].join("\n");

function assertKnownFlags(flags: Readonly<Record<string, string>>, allowed: readonly string[]): void {
  const allowedFlags = new Set(allowed);
  for (const name of Object.keys(flags)) {
    if (!allowedFlags.has(name)) throw new Error(`不支持的 CLI 参数：--${name}`);
  }
}

function parseArguments(args: readonly string[]): ParsedArguments {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const name = value.slice(2);
    const next = args[index + 1];
    if (!name || !next || next.startsWith("--") || flags[name] !== undefined) {
      throw new Error(`无效或重复的 CLI 参数：${value}`);
    }
    flags[name] = next;
    index += 1;
  }
  return Object.freeze({ positional, flags: Object.freeze(flags) });
}

function requiredFlag(flags: Readonly<Record<string, string>>, name: string): string {
  const value = flags[name];
  if (!value?.trim()) throw new Error(`缺少必填参数：--${name}\n\n${USAGE}`);
  return value;
}

function optionalNumber(
  flags: Readonly<Record<string, string>>,
  name: string,
  options: Readonly<{ integer?: boolean }> = {},
): number | undefined {
  const value = flags[name];
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || (options.integer && !Number.isInteger(number))) {
    throw new Error(`--${name} 必须是${options.integer ? "整数" : "数字"}`);
  }
  return number;
}

function readJson(filePath: string, label: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8")) as unknown;
  } catch {
    throw new Error(`无法读取 ${label}：${filePath}`);
  }
}

function parseScores(value: unknown): FidelityScore[] {
  const scores = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>)["scores"])
      ? (value as Record<string, unknown>)["scores"] as unknown[]
      : undefined;
  if (!scores) throw new Error("评分文件必须是数组，或是含 scores 数组的 JSON 对象");
  return scores as FidelityScore[];
}

function writeJson(write: (line: string) => void, value: unknown): void {
  write(JSON.stringify(value));
}

function baselineSummary(result: ReturnType<typeof freezeFidelityBaseline>): Readonly<Record<string, unknown>> {
  return Object.freeze({
    status: result.status,
    baseline: {
      schemaVersion: result.baseline.schemaVersion,
      characterId: result.baseline.characterId,
      characterVersion: result.baseline.characterVersion,
      displayName: result.baseline.displayName,
      responseLanguage: result.baseline.responseLanguage,
      sourcePackageManifestSha256: result.baseline.sourcePackageManifestSha256,
      sourceContentDigest: result.baseline.sourceContentDigest,
      frozenAt: result.baseline.frozenAt,
      fileCount: result.baseline.files.length,
    },
  });
}

export async function runFidelityCli(
  args: readonly string[],
  dependencies: CliDependencies = {},
): Promise<void> {
  const write = dependencies.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "help") {
    write(USAGE);
    return;
  }
  const parsed = parseArguments(rest);
  if (command === "freeze") {
    assertKnownFlags(parsed.flags, ["frozen-at"]);
    if (parsed.positional.length !== 2) throw new Error(USAGE);
    const result = freezeFidelityBaseline({
      sourcePackageRoot: parsed.positional[0],
      baselineDirectory: parsed.positional[1],
      ...(parsed.flags["frozen-at"] ? { frozenAt: parsed.flags["frozen-at"] } : {}),
    });
    // Baseline 正文可能包含 local-only Character Content；CLI 只能输出可审计摘要。
    writeJson(write, baselineSummary(result));
    return;
  }
  const harness = createCharacterFidelityHarness({
    generate: dependencies.generate ?? createLocalFidelityGenerator(),
  });
  if (command === "run") {
    assertKnownFlags(parsed.flags, [
      "baseline", "candidate", "prompts", "output", "base-url", "model", "seed", "session-id",
      "temperature", "max-tokens",
    ]);
    if (parsed.positional.length > 0) throw new Error(USAGE);
    const outputDirectory = requiredFlag(parsed.flags, "output");
    const temperature = optionalNumber(parsed.flags, "temperature");
    const maxTokens = optionalNumber(parsed.flags, "max-tokens", { integer: true });
    if (temperature !== undefined && (temperature < 0 || temperature > 2)) {
      throw new Error("--temperature 必须在 0 到 2 之间");
    }
    if (maxTokens !== undefined && maxTokens < 1) {
      throw new Error("--max-tokens 必须是正整数");
    }
    const model: FidelityModelConfiguration = {
      provider: "local",
      baseUrl: requiredFlag(parsed.flags, "base-url"),
      model: requiredFlag(parsed.flags, "model"),
      ...(temperature !== undefined
        ? { temperature }
        : {}),
      ...(maxTokens !== undefined
        ? { maxTokens }
        : {}),
    };
    const result = await harness.run({
      baseline: (await import("./character-fidelity")).loadFidelityBaseline(requiredFlag(parsed.flags, "baseline")),
      candidatePackageRoot: requiredFlag(parsed.flags, "candidate"),
      promptPack: readJson(requiredFlag(parsed.flags, "prompts"), "Fidelity Prompt Pack") as FidelityPromptPack,
      sessionDirectory: outputDirectory,
      sessionId: parsed.flags["session-id"] ?? path.basename(path.resolve(outputDirectory)),
      model,
      randomSeed: optionalNumber(parsed.flags, "seed", { integer: true })
        ?? (() => { throw new Error("缺少 --seed\n\n" + USAGE); })(),
    });
    writeJson(write, {
      sessionId: result.sessionId,
      pairCount: result.pairCount,
      reviewFile: "review.json",
      scoreFile: "scores.json",
    });
    return;
  }
  if (command === "score") {
    assertKnownFlags(parsed.flags, ["session", "scores"]);
    if (parsed.positional.length > 0) throw new Error(USAGE);
    const sessionDirectory = requiredFlag(parsed.flags, "session");
    const result = await harness.recordScores({
      sessionDirectory,
      scores: parseScores(readJson(requiredFlag(parsed.flags, "scores"), "Fidelity scores")),
    });
    writeJson(write, { scoreCount: result.scoreCount, scoreFile: "scores.json" });
    return;
  }
  if (command === "report") {
    assertKnownFlags(parsed.flags, ["session"]);
    if (parsed.positional.length > 0) throw new Error(USAGE);
    writeJson(write, harness.report({ sessionDirectory: requiredFlag(parsed.flags, "session") }));
    return;
  }
  throw new Error(`未知 Character Fidelity 命令：${command}\n\n${USAGE}`);
}

/**
 * 面向 CLI/Electron 调用方的总是返回退出码的入口。它把原先的简写命令保留在
 * runFidelityCli 内部，同时提供显式的 --source / --out 参数，避免错误穿过 IPC。
 */
export async function runCharacterFidelityCli(
  args: readonly string[],
  dependencies: CharacterFidelityCliDependencies = {},
): Promise<number> {
  const stdout = dependencies.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const stderr = dependencies.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  try {
    const [command, ...rest] = args;
    if (!command) {
      stdout(USAGE);
      return 0;
    }
    if (command === "help" || command === "--help") {
      stdout(USAGE);
      return 0;
    }
    const parsed = parseArguments(rest);
    const translated: string[] = [command];
    if (command === "freeze") {
      assertKnownFlags(parsed.flags, ["source", "out", "frozen-at"]);
      if (parsed.positional.length > 0) throw new Error(USAGE);
      translated.push(
        requiredFlag(parsed.flags, "source"),
        requiredFlag(parsed.flags, "out"),
      );
      if (parsed.flags["frozen-at"]) translated.push("--frozen-at", parsed.flags["frozen-at"]);
    } else if (command === "run") {
      assertKnownFlags(parsed.flags, [
        "baseline", "candidate", "prompts", "out", "base-url", "model", "seed", "session-id",
        "temperature", "max-tokens",
      ]);
      if (parsed.positional.length > 0) throw new Error(USAGE);
      for (const name of ["baseline", "candidate", "prompts"] as const) {
        translated.push(`--${name}`, requiredFlag(parsed.flags, name));
      }
      translated.push("--output", requiredFlag(parsed.flags, "out"));
      translated.push("--base-url", parsed.flags["base-url"] ?? "http://127.0.0.1:8080/v1");
      for (const name of ["session-id", "model", "seed", "temperature", "max-tokens"] as const) {
        if (parsed.flags[name] !== undefined) translated.push(`--${name}`, parsed.flags[name]);
      }
    } else if (command === "score") {
      assertKnownFlags(parsed.flags, ["session", "scores"]);
      if (parsed.positional.length > 0) throw new Error(USAGE);
      translated.push("--session", requiredFlag(parsed.flags, "session"));
      translated.push("--scores", requiredFlag(parsed.flags, "scores"));
    } else if (command === "report") {
      assertKnownFlags(parsed.flags, ["session"]);
      if (parsed.positional.length > 0) throw new Error(USAGE);
      translated.push("--session", requiredFlag(parsed.flags, "session"));
    } else {
      throw new Error(`未知 Character Fidelity 命令：${command}\n\n${USAGE}`);
    }
    await runFidelityCli(translated, {
      write: stdout,
      ...(dependencies.createGenerator ? { generate: dependencies.createGenerator() } : {}),
    });
    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

const invokedPath = process.argv[1] ?? "";
if (/character-fidelity-cli(?:\.js)?$/u.test(invokedPath)) {
  void runCharacterFidelityCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
