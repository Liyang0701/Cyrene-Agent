import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { runCharacterFidelityCli } from "./character-fidelity-cli";
import type { FidelityGenerator } from "./character-fidelity";

function writeCharacterPackage(root: string, input: Readonly<{
  version: string;
  identity: string;
}>): string {
  const packageRoot = path.join(root, "local.hoshino");
  fs.mkdirSync(path.join(packageRoot, "content"), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, "character.json"), JSON.stringify({
    schemaVersion: 1,
    id: "local.hoshino",
    version: input.version,
    displayName: "星野",
    distributionStatus: "local-only",
    content: {
      identity: "content/identity.md",
      soul: "content/soul.md",
      avatar: "avatar.png",
    },
    response: { language: "ja", translation: { targetLanguage: "zh-CN" } },
  }));
  fs.writeFileSync(path.join(packageRoot, "content", "identity.md"), input.identity);
  fs.writeFileSync(path.join(packageRoot, "content", "soul.md"), "星野の soul\n");
  fs.writeFileSync(path.join(packageRoot, "avatar.png"), "not copied into baseline");
  return packageRoot;
}

function ioCapture(): Readonly<{ stdout: string[]; stderr: string[] }> {
  return { stdout: [], stderr: [] };
}

describe("Character Fidelity CLI", () => {
  it("freezes a baseline and runs a local-only anonymous session without printing character text", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "character-fidelity-cli-"));
    const baselinePackage = writeCharacterPackage(path.join(root, "baseline"), {
      version: "1.0.1",
      identity: "工程版 identity\n",
    });
    const candidatePackage = writeCharacterPackage(path.join(root, "candidate"), {
      version: "1.1.0",
      identity: "候補版 identity\n",
    });
    const capture = ioCapture();
    const baselineDirectory = path.join(root, "private", "baseline-v1");

    const frozenExitCode = await runCharacterFidelityCli([
      "freeze",
      "--source", baselinePackage,
      "--out", baselineDirectory,
    ], {
      stdout: (line) => capture.stdout.push(line),
      stderr: (line) => capture.stderr.push(line),
    });

    expect(frozenExitCode).toBe(0);
    expect(capture.stderr).toEqual([]);
    expect(capture.stdout.join("\n")).not.toContain("工程版 identity");
    const baselinePath = path.join(baselineDirectory, "baseline.json");
    expect(fs.existsSync(baselinePath)).toBe(true);

    const promptPath = path.join(root, "prompts.json");
    fs.writeFileSync(promptPath, JSON.stringify({
      schemaVersion: 1,
      id: "hoshino-fidelity-v1",
      version: "1.0.0",
      characterId: "local.hoshino",
      prompts: [{ id: "daily", category: "daily", mode: "chat", text: "今日は疲れた。" }],
    }));
    const generator = vi.fn<FidelityGenerator>(async ({ variant }) => ({
      text: variant === "baseline" ? "先生、少し休もうか。" : "先生、無理しないで。",
    }));

    const runExitCode = await runCharacterFidelityCli([
      "run",
      "--baseline", baselinePath,
      "--candidate", candidatePackage,
      "--prompts", promptPath,
      "--out", path.join(root, "private", "session-001"),
      "--session-id", "session-001",
      "--model", "qwen3.5-9b",
      "--seed", "20260719",
    ], {
      createGenerator: () => generator,
      stdout: (line) => capture.stdout.push(line),
      stderr: (line) => capture.stderr.push(line),
    });

    expect(runExitCode).toBe(0);
    expect(generator).toHaveBeenCalledTimes(2);
    expect(capture.stderr).toEqual([]);
    expect(capture.stdout.join("\n")).not.toContain("候補版 identity");
    const review = fs.readFileSync(path.join(root, "private", "session-001", "review.json"), "utf8");
    expect(review).not.toContain("baseline");
    expect(review).not.toContain("candidate");
  });

  it("returns a nonzero result for malformed input instead of throwing through Electron", async () => {
    const capture = ioCapture();
    const exitCode = await runCharacterFidelityCli(["run", "--baseline", "only-one-option"], {
      stdout: (line) => capture.stdout.push(line),
      stderr: (line) => capture.stderr.push(line),
    });

    expect(exitCode).toBe(2);
    expect(capture.stdout).toEqual([]);
    expect(capture.stderr.join("\n")).toContain("缺少必填参数");
  });

  it("rejects unknown flags instead of silently changing the evaluation command", async () => {
    const capture = ioCapture();
    const exitCode = await runCharacterFidelityCli([
      "freeze",
      "--source", "/tmp/source",
      "--out", "/tmp/output",
      "--unexpected", "value",
    ], {
      stdout: (line) => capture.stdout.push(line),
      stderr: (line) => capture.stderr.push(line),
    });

    expect(exitCode).toBe(2);
    expect(capture.stdout).toEqual([]);
    expect(capture.stderr.join("\n")).toContain("不支持的 CLI 参数：--unexpected");
  });
});
